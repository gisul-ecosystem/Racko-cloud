package tracker

// watcher.go — watches the filesystem and registry for changes after baseline,
// batches events, uploads file content to SeaweedFS via the server, and sends
// activity records to the server's activity log endpoint.
//
// Architecture:
//   Windows: USN Journal polling (usn_watcher_windows.go) — one handle per volume,
//   kernel-level reliability, survives agent restarts via checkpoint files.
//   Non-Windows: no-op stub (usn_watcher_other.go).
//
//   Events are debounced into 5-second batches (prevents event storms during
//   large software installs that create thousands of files rapidly).
//   Each batch is processed in a separate goroutine so uploads never block
//   the event loop. New/modified files are read + uploaded to SeaweedFS;
//   deletions and renames are recorded. The activity record is then posted
//   to the server.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	// Values are usnOp constants (usnOpWrite, usnOpDelete, usnOpRename).
	mu      sync.Mutex
	pending map[string]usnOp  // path → latest op
	renamed map[string]string  // newPath → oldPath for renames

	// usnRenameOld maps FileReferenceNumber → old path, used to correlate
	// RenameOldName and RenameNewName USN records into a single rename event.
	usnRenameOld map[uint64]string

	// baseline used for diffing registry + env vars
	baseline *Baseline

	// lastEnvSnapshot is the last known env var state for detecting changes.
	lastSysEnv  map[string]string
	lastUserEnv map[string]string
}

// NewWatcher creates a Watcher. baseline may be nil if not yet captured.
func NewWatcher(agentID string, cfg *config.Config, baseline *Baseline) *Watcher {
	w := &Watcher{
		agentID:      agentID,
		cfg:          cfg,
		client:       &http.Client{Timeout: 60 * time.Second},
		pending:      make(map[string]usnOp),
		renamed:      make(map[string]string),
		usnRenameOld: make(map[uint64]string),
		baseline:     baseline,
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
	log.Println("[tracker/watcher] Starting USN Journal watcher...")

	// Launch USN journal watchers for all fixed drives (Windows)
	// or no-op stub (other platforms) in a separate goroutine.
	usnDone := make(chan struct{})
	go func() {
		w.startUSNWatcher(usnDone)
	}()

	// Flush timer — collect pending events in 5-second batches.
	// flush() runs in its own goroutine so large file uploads never block
	// the event loop or the USN journal reader.
	flushTicker := time.NewTicker(5 * time.Second)
	defer flushTicker.Stop()

	// Registry + env var poll — check every 30 seconds.
	regTicker := time.NewTicker(30 * time.Second)
	defer regTicker.Stop()

	log.Println("[tracker/watcher] Watching started")

	for {
		select {
		case <-done:
			close(usnDone)
			log.Println("[tracker/watcher] Stopping.")
			return

		case <-flushTicker.C:
			// Run flush in a goroutine — uploads can take minutes for large files.
			// This ensures the ticker keeps firing and USN events keep accumulating
			// even while a previous flush batch is still uploading.
			go w.flush()

		case <-regTicker.C:
			go w.checkRegistryAndEnv()
		}
	}
}

// flush processes all pending events and sends activity records to the server.
// Called from a goroutine so it never blocks the main watcher select loop.
func (w *Watcher) flush() {
	w.mu.Lock()
	if len(w.pending) == 0 {
		w.mu.Unlock()
		return
	}
	// Snapshot pending and clear it so the USN reader can keep accumulating.
	snapshot := w.pending
	renames := w.renamed
	w.pending = make(map[string]usnOp)
	w.renamed = make(map[string]string)
	w.mu.Unlock()

	for path, op := range snapshot {
		switch op {
		case usnOpDelete:
			w.sendActivity(ActivityEvent{
				AgentID:   w.agentID,
				Type:      ActivityFileDelete,
				Timestamp: time.Now().UTC(),
				Payload:   FileDeletePayload{Path: path},
			})

		case usnOpRename:
			for newPath, oldPath := range renames {
				if strings.EqualFold(oldPath, path) {
					w.sendActivity(ActivityEvent{
						AgentID:   w.agentID,
						Type:      ActivityFileRename,
						Timestamp: time.Now().UTC(),
						Payload:   FileRenamePayload{OldPath: path, NewPath: newPath},
					})
					break
				}
			}

		case usnOpWrite:
			info, err := os.Stat(path)
			if err != nil || info.IsDir() {
				continue
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
	if w.baseline != nil && w.isUnchangedFromBaseline(path, hash) {
		return
	}

	storageRef, err := w.uploadFile(path, info.Size(), hash)
	if err != nil {
		log.Printf("[tracker/watcher] Upload failed for %s: %v", path, err)
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

// uploadFile fetches a presigned S3 PUT URL from core-api and uses it to upload
// the file directly to SeaweedFS — bypassing nginx entirely so there is no size limit.
// Falls back to the legacy multipart endpoint if presigned URL fetch fails.
func (w *Watcher) uploadFile(path string, sizeBytes int64, hash string) (string, error) {
	mimeType := mime.TypeByExtension(filepath.Ext(path))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	// ── Step 2: Request a presigned PUT URL from core-api ─────────────────────
	// URL-encode query params — mimeType contains '/' which would break the URL
	uploadURL := fmt.Sprintf(
		"%s/api/v1/agent/upload-url?sha256=%s&filename=%s&mimeType=%s",
		w.cfg.PlatformURL,
		hash,
		url.QueryEscape(filepath.Base(path)),
		url.QueryEscape(mimeType),
	)

	req, err := http.NewRequest(http.MethodGet, uploadURL, nil)
	if err != nil {
		return "", fmt.Errorf("build upload-url request: %w", err)
	}
	req.Header.Set("X-Agent-ID", w.agentID)

	urlResp, err := w.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch presigned url: %w", err)
	}
	defer urlResp.Body.Close()

	if urlResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(urlResp.Body)
		return "", fmt.Errorf("upload-url server %d: %s", urlResp.StatusCode, string(body))
	}

	var urlResult struct {
		Data struct {
			PresignedUrl string `json:"presignedUrl"`
			StorageRef   string `json:"storageRef"`
		} `json:"data"`
	}
	if err := json.NewDecoder(urlResp.Body).Decode(&urlResult); err != nil {
		return "", fmt.Errorf("decode upload-url response: %w", err)
	}

	// ── Step 3: PUT the file directly to SeaweedFS using the presigned URL ────
	// This bypasses nginx completely — no size limit.
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	putReq, err := http.NewRequest(http.MethodPut, urlResult.Data.PresignedUrl, f)
	if err != nil {
		return "", fmt.Errorf("build PUT request: %w", err)
	}
	putReq.Header.Set("Content-Type", mimeType)
	putReq.ContentLength = sizeBytes

	// Use a longer timeout for large files
	uploadClient := &http.Client{Timeout: 30 * time.Minute}
	putResp, err := uploadClient.Do(putReq)
	if err != nil {
		return "", fmt.Errorf("PUT to S3: %w", err)
	}
	defer putResp.Body.Close()

	if putResp.StatusCode != http.StatusOK && putResp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(putResp.Body)
		return "", fmt.Errorf("S3 PUT %d: %s", putResp.StatusCode, string(body))
	}

	return urlResult.Data.StorageRef, nil
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

// diffRegistry exports only specific high-value registry keys and records
// changes when their content changes. Uses per-key exports (not full hive)
// to keep payloads small — each export is a few KB, not several MB.
func (w *Watcher) diffRegistry() {
	// Target only the most valuable user-installed app keys.
	// These cover 95% of what matters for clone replay:
	//   - HKCU\Software\*  : user-installed app settings and configs
	//   - HKLM\SOFTWARE\*  : system-wide app settings (non-Microsoft subtree only)
	// We export at a more granular level (direct children, not the full tree)
	// so each payload stays under 100KB.
	regKeys := []string{
		`HKCU\Environment`,
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		`HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce`,
		`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`,
		`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
		`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`,
	}

	// Also export direct children of HKCU\Software (user app configs) — one key at a time
	// This replaces the full hive export with targeted per-app exports
	userSoftwareKeys := runPS(`
Get-ChildItem 'HKCU:\Software' -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -notlike 'Microsoft*' -and $_.PSChildName -notlike 'Classes*' } |
  ForEach-Object { 'HKCU\Software\' + $_.PSChildName } |
  Select-Object -First 50 |
  ConvertTo-Json -Compress
`)
	if userSoftwareKeys != "" {
		var keys []string
		if err := json.Unmarshal([]byte(userSoftwareKeys), &keys); err == nil {
			regKeys = append(regKeys, keys...)
		}
	}

	for _, key := range regKeys {
		// Export this specific key to a temp file
		tmpFile := `C:\Windows\Temp\racko-reg-` + strings.ReplaceAll(key, `\`, `-`) + `.reg`
		export := runPS(fmt.Sprintf(
			`reg export "%s" "%s" /y 2>$null; if (Test-Path '%s') { Get-Content '%s' -Raw; Remove-Item '%s' -Force } `,
			key, tmpFile, tmpFile, tmpFile, tmpFile,
		))
		if export == "" {
			continue
		}

		// Hash the export to detect changes
		h := sha256.New()
		h.Write([]byte(export))
		hashNow := hex.EncodeToString(h.Sum(nil))

		cacheKey := "reg:" + key
		if lastHash, ok := w.lastSysEnv[cacheKey]; ok && lastHash == hashNow {
			continue // unchanged
		}
		w.lastSysEnv[cacheKey] = hashNow

		// Cap export size to 512KB per key — prevents oversized payloads from
		// pathological registry entries (e.g. binary data stored in registry)
		if len(export) > 512*1024 {
			export = export[:512*1024] + "\n; [truncated]"
		}

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
