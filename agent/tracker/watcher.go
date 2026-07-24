package tracker

// watcher.go — watches the filesystem and registry for changes after baseline,
// batches events, uploads file content to SeaweedFS via the server, and sends
// activity records to the server's activity log endpoint.
//
// Architecture:
//   fsnotify watches all paths returned by getWatchPaths() recursively.
//   Events are debounced into 5-second batches (prevents event storms during
//   large software installs that create thousands of files rapidly).
//   Each batch is processed: new/modified files are read + uploaded; deletions
//   and renames are recorded. The activity record is then posted to the server.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/racko-ai/agent/config"
)

// ─── Activity types ───────────────────────────────────────────────────────────

// ActivityType classifies what kind of change happened.
type ActivityType string

const (
	ActivityFileWrite       ActivityType = "file_write"
	ActivityFileDelete      ActivityType = "file_delete"
	ActivityFileRename      ActivityType = "file_rename"
	ActivitySoftwareInstall ActivityType = "software_install"
	ActivityRegChange       ActivityType = "registry_change"
	ActivityEnvVarChange    ActivityType = "env_var_change"
	ActivityScheduledTask   ActivityType = "scheduled_task"
)

// ActivityEvent is a single change record sent to the server.
type ActivityEvent struct {
	AgentID   string       `json:"agentId"`
	Type      ActivityType `json:"type"`
	Timestamp time.Time    `json:"timestamp"`
	Payload   interface{}  `json:"payload"`
}

// FileWritePayload carries metadata for a file_write event.
// StorageRef is the SeaweedFS file ID returned after upload.
type FileWritePayload struct {
	Path       string `json:"path"`
	SHA256     string `json:"sha256"`
	SizeBytes  int64  `json:"sizeBytes"`
	StorageRef string `json:"storageRef"` // SeaweedFS fid
	MimeType   string `json:"mimeType"`
}

// FileDeletePayload carries the path of a deleted file.
type FileDeletePayload struct {
	Path string `json:"path"`
}

// FileRenamePayload carries old + new path for a rename/move.
type FileRenamePayload struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

// RegChangePayload carries a registry key + its new value (exported as .reg text).
type RegChangePayload struct {
	KeyPath  string `json:"keyPath"`
	RegExport string `json:"regExport"` // output of `reg export`
}

// EnvVarPayload carries a changed environment variable.
type EnvVarPayload struct {
	Scope string `json:"scope"` // "Machine" or "User"
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

// Watcher watches the filesystem and registry, batches events, uploads files,
// and posts activity records to the platform server.
type Watcher struct {
	agentID  string
	cfg      *config.Config
	client   *http.Client

	// pending holds paths that changed since the last flush, protected by mu.
	mu      sync.Mutex
	pending map[string]fsnotify.Op // path → latest Op
	renamed map[string]string      // newPath → oldPath for renames

	// baseline used for diffing registry + env vars
	baseline *Baseline

	// lastEnvSnapshot is the last known env var state for detecting changes.
	lastSysEnv  map[string]string
	lastUserEnv map[string]string
}

// NewWatcher creates a Watcher. baseline may be nil if not yet captured.
func NewWatcher(agentID string, cfg *config.Config, baseline *Baseline) *Watcher {
	w := &Watcher{
		agentID:  agentID,
		cfg:      cfg,
		client:   &http.Client{Timeout: 60 * time.Second},
		pending:  make(map[string]fsnotify.Op),
		renamed:  make(map[string]string),
		baseline: baseline,
	}
	// Seed env var snapshot from baseline so we only report deltas.
	if baseline != nil {
		w.lastSysEnv = envSliceToMap(baseline.SystemEnvVars)
		w.lastUserEnv = envSliceToMap(baseline.UserEnvVars)
	} else {
		w.lastSysEnv = make(map[string]string)
		w.lastUserEnv = make(map[string]string)
	}
	return w
}

// Start begins watching. Blocks until done is closed.
func (w *Watcher) Start(done <-chan struct{}) {
	log.Println("[tracker/watcher] Starting filesystem watcher...")

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("[tracker/watcher] Could not create fsnotify watcher: %v", err)
		return
	}
	defer fsw.Close()

	// Add all watch paths recursively.
	for _, root := range getWatchPaths() {
		if _, err := os.Stat(root); err != nil {
			continue // path doesn't exist on this VM — skip
		}
		w.addRecursive(fsw, root)
	}

	// Flush timer — collect events in 5-second batches to avoid event storms.
	flushTicker := time.NewTicker(5 * time.Second)
	defer flushTicker.Stop()

	// Registry + env var poll — check every 30 seconds.
	regTicker := time.NewTicker(30 * time.Second)
	defer regTicker.Stop()

	log.Println("[tracker/watcher] Watching started")

	for {
		select {
		case <-done:
			log.Println("[tracker/watcher] Stopping.")
			return

		case event, ok := <-fsw.Events:
			if !ok {
				return
			}
			w.handleFsEvent(event, fsw)

		case err, ok := <-fsw.Errors:
			if !ok {
				return
			}
			log.Printf("[tracker/watcher] fsnotify error: %v", err)

		case <-flushTicker.C:
			w.flush()

		case <-regTicker.C:
			w.checkRegistryAndEnv()
		}
	}
}

// addRecursive adds path and all subdirectories to the fsnotify watcher.
func (w *Watcher) addRecursive(fsw *fsnotify.Watcher, root string) {
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if shouldExcludePath(path) {
			return filepath.SkipDir
		}
		if err := fsw.Add(path); err != nil {
			// Non-fatal — some dirs are access-denied, just skip them
			return nil
		}
		return nil
	})
}

// handleFsEvent debounces filesystem events into the pending map.
func (w *Watcher) handleFsEvent(event fsnotify.Event, fsw *fsnotify.Watcher) {
	if shouldExcludePath(event.Name) {
		return
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	switch {
	case event.Has(fsnotify.Rename):
		// fsnotify fires Rename on the OLD path. The CREATE on the new path
		// comes as a separate event. We track the old path for correlation.
		w.pending[event.Name] = fsnotify.Rename
	case event.Has(fsnotify.Remove):
		w.pending[event.Name] = fsnotify.Remove
	case event.Has(fsnotify.Create):
		// If a new directory is created, add it to the watcher so new files
		// inside it are also watched.
		info, err := os.Stat(event.Name)
		if err == nil && info.IsDir() {
			w.addRecursive(fsw, event.Name)
		}
		w.pending[event.Name] = fsnotify.Create
	case event.Has(fsnotify.Write):
		// Only upgrade to Write if we haven't already seen a Create for this path
		// (Create + Write = new file, just record as Create).
		if existing, ok := w.pending[event.Name]; !ok || existing == fsnotify.Write {
			w.pending[event.Name] = fsnotify.Write
		}
	case event.Has(fsnotify.Chmod):
		// Ignore permission-only changes — not relevant for clone replay.
	}
}

// flush processes all pending events and sends activity records to the server.
func (w *Watcher) flush() {
	w.mu.Lock()
	if len(w.pending) == 0 {
		w.mu.Unlock()
		return
	}
	// Snapshot pending and clear it so the watcher can keep accumulating.
	snapshot := w.pending
	renames := w.renamed
	w.pending = make(map[string]fsnotify.Op)
	w.renamed = make(map[string]string)
	w.mu.Unlock()

	for path, op := range snapshot {
		switch op {
		case fsnotify.Remove, fsnotify.Rename:
			// Check if this is the old side of a rename.
			if newPath, ok := renames[path]; ok {
				w.sendActivity(ActivityEvent{
					AgentID:   w.agentID,
					Type:      ActivityFileRename,
					Timestamp: time.Now().UTC(),
					Payload:   FileRenamePayload{OldPath: path, NewPath: newPath},
				})
			} else {
				w.sendActivity(ActivityEvent{
					AgentID:   w.agentID,
					Type:      ActivityFileDelete,
					Timestamp: time.Now().UTC(),
					Payload:   FileDeletePayload{Path: path},
				})
			}

		case fsnotify.Create, fsnotify.Write:
			info, err := os.Stat(path)
			if err != nil || info.IsDir() {
				continue // file disappeared or is a dir — skip
			}
			w.uploadAndRecord(path, info)
		}
	}
}

// uploadAndRecord uploads the file to SeaweedFS (via server proxy) and records
// the activity event. Handles files of any size using streaming multipart upload.
func (w *Watcher) uploadAndRecord(path string, info os.FileInfo) {
	hash := hashFile(path)
	if hash == "" {
		return // unreadable file — skip
	}

	// Check if the baseline already has this exact file with the same hash.
	// If so, it hasn't changed and we don't need to re-upload.
	if w.baseline != nil && w.isUnchangedFromBaseline(path, hash) {
		return
	}

	storageRef, err := w.uploadFile(path, info.Size())
	if err != nil {
		log.Printf("[tracker/watcher] Upload failed for %s: %v", path, err)
		// Still record the activity with an empty storageRef so the activity
		// log is complete. Clone replay will skip files with no storageRef.
		storageRef = ""
	}

	mimeType := mime.TypeByExtension(filepath.Ext(path))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	w.sendActivity(ActivityEvent{
		AgentID:   w.agentID,
		Type:      ActivityFileWrite,
		Timestamp: time.Now().UTC(),
		Payload: FileWritePayload{
			Path:       path,
			SHA256:     hash,
			SizeBytes:  info.Size(),
			StorageRef: storageRef,
			MimeType:   mimeType,
		},
	})
}

// uploadFile streams the file to the server's file-upload endpoint which proxies
// it to SeaweedFS. Returns the SeaweedFS file ID (storageRef).
// Uses multipart streaming so large files don't buffer entirely in memory.
func (w *Watcher) uploadFile(path string, sizeBytes int64) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)

	// Write multipart in a goroutine so reading and writing happen concurrently.
	go func() {
		defer pw.Close()
		defer mw.Close()
		_ = mw.WriteField("agentId", w.agentID)
		_ = mw.WriteField("filePath", path)
		part, err := mw.CreateFormFile("file", filepath.Base(path))
		if err != nil {
			pw.CloseWithError(err)
			return
		}
		if _, err := io.Copy(part, f); err != nil {
			pw.CloseWithError(err)
		}
	}()

	uploadURL := w.cfg.PlatformURL + "/api/v1/agent/file-upload"
	req, err := http.NewRequest(http.MethodPost, uploadURL, pr)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Agent-ID", w.agentID)
	// Do not set Content-Length — we're streaming, length is unknown.

	// Use a longer timeout for file uploads — large files may take a while.
	uploadClient := &http.Client{Timeout: 30 * time.Minute}
	resp, err := uploadClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("server %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data struct {
			StorageRef string `json:"storageRef"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return result.Data.StorageRef, nil
}

// sendActivity POSTs a single activity event to the server.
func (w *Watcher) sendActivity(event ActivityEvent) {
	body, err := json.Marshal(event)
	if err != nil {
		log.Printf("[tracker/watcher] marshal activity: %v", err)
		return
	}

	url := w.cfg.PlatformURL + "/api/v1/agent/activity"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		log.Printf("[tracker/watcher] create request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", w.agentID)

	resp, err := w.client.Do(req)
	if err != nil {
		log.Printf("[tracker/watcher] send activity: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("[tracker/watcher] activity rejected %d: %s", resp.StatusCode, string(b))
	}
}

// checkRegistryAndEnv polls registry keys and env vars for changes.
// Called every 30 seconds by the reg ticker.
func (w *Watcher) checkRegistryAndEnv() {
	w.diffEnvVars("Machine", w.lastSysEnv)
	w.diffEnvVars("User", w.lastUserEnv)
	w.diffRegistry()
}

// diffEnvVars compares current env vars in `scope` against the last known snapshot,
// and sends activity events for anything new or changed.
func (w *Watcher) diffEnvVars(scope string, last map[string]string) {
	current := envSliceToMap(collectEnvVars(scope))
	for k, v := range current {
		if lastV, ok := last[k]; !ok || lastV != v {
			w.sendActivity(ActivityEvent{
				AgentID:   w.agentID,
				Type:      ActivityEnvVarChange,
				Timestamp: time.Now().UTC(),
				Payload:   EnvVarPayload{Scope: scope, Key: k, Value: v},
			})
			last[k] = v
		}
	}
}

// diffRegistry exports HKCU\Software and HKLM\Software (non-Microsoft) and
// records any changes. Uses PowerShell reg export for full fidelity.
func (w *Watcher) diffRegistry() {
	regKeys := []string{
		`HKCU\Software`,
		`HKLM\SOFTWARE`,
	}
	for _, key := range regKeys {
		export := runPS(fmt.Sprintf(`reg export "%s" $env:TEMP\racko-reg-tmp.reg /y 2>$null; Get-Content $env:TEMP\racko-reg-tmp.reg -Raw -ErrorAction SilentlyContinue`, key))
		if export == "" {
			continue
		}
		// We detect changes by hashing the export. If it changed since last check, record it.
		h := sha256.New()
		h.Write([]byte(export))
		hashNow := hex.EncodeToString(h.Sum(nil))

		cacheKey := "reg:" + key
		if lastHash, ok := w.lastSysEnv[cacheKey]; ok && lastHash == hashNow {
			continue // unchanged
		}
		w.lastSysEnv[cacheKey] = hashNow

		w.sendActivity(ActivityEvent{
			AgentID:   w.agentID,
			Type:      ActivityRegChange,
			Timestamp: time.Now().UTC(),
			Payload: RegChangePayload{
				KeyPath:   key,
				RegExport: export,
			},
		})
	}
}

// isUnchangedFromBaseline returns true if `path` exists in the baseline with the
// same SHA256 hash — meaning the file hasn't changed since baseline was captured.
func (w *Watcher) isUnchangedFromBaseline(path, hash string) bool {
	if w.baseline == nil {
		return false
	}
	lp := strings.ToLower(path)
	for _, fe := range w.baseline.Files {
		if strings.ToLower(fe.Path) == lp {
			return fe.SHA256 == hash
		}
	}
	return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// envSliceToMap converts a []EnvVar to a map for fast lookup.
func envSliceToMap(vars []EnvVar) map[string]string {
	m := make(map[string]string, len(vars))
	for _, v := range vars {
		m[v.Key] = v.Value
	}
	return m
}
