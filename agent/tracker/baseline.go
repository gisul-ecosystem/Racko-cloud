// Package tracker records the VM's initial state (baseline) on first agent install,
// then tracks every change made after that. The baseline + change log together enable
// two features:
//   - Reset: undo everything recorded in the change log (back to baseline state)
//   - Clone: replay the change log onto another VM (identical state transfer)
package tracker

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/racko-ai/agent/config"
)

// ─── Baseline types ───────────────────────────────────────────────────────────

// InstalledApp represents a software entry from the Windows registry uninstall keys.
type InstalledApp struct {
	DisplayName    string `json:"displayName"`
	DisplayVersion string `json:"displayVersion"`
	Publisher      string `json:"publisher"`
	InstallLocation string `json:"installLocation,omitempty"`
	UninstallString string `json:"uninstallString,omitempty"`
}

// FileEntry is a lightweight record of a file path + its SHA256 hash at baseline time.
// The hash is used to detect modifications later.
type FileEntry struct {
	Path    string `json:"path"`
	SHA256  string `json:"sha256"`
	SizeBytes int64  `json:"sizeBytes"`
}

// EnvVar is a key=value environment variable.
type EnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ScheduledTaskEntry is a minimal representation of a scheduled task.
type ScheduledTaskEntry struct {
	Name     string `json:"name"`
	TaskPath string `json:"taskPath"`
	State    string `json:"state"`
}

// ServiceEntry is a minimal representation of a Windows service.
type ServiceEntry struct {
	Name      string `json:"name"`
	State     string `json:"state"`
	StartType string `json:"startType"`
	BinaryPath string `json:"binaryPath,omitempty"`
}

// Baseline is the full snapshot of the VM state at agent install time.
type Baseline struct {
	AgentID          string               `json:"agentId"`
	CapturedAt       time.Time            `json:"capturedAt"`
	InstalledApps    []InstalledApp       `json:"installedApps"`
	Files            []FileEntry          `json:"files"`
	SystemEnvVars    []EnvVar             `json:"systemEnvVars"`
	UserEnvVars      []EnvVar             `json:"userEnvVars"`
	ScheduledTasks   []ScheduledTaskEntry `json:"scheduledTasks"`
	Services         []ServiceEntry       `json:"services"`
	ProgramFolders   []string             `json:"programFolders"`
	ProgramDataFolders []string           `json:"programDataFolders"`
}

// baselineFilePath returns the local path where the baseline is persisted.
func baselineFilePath() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\racko-agent\baseline.json`
	}
	return "/etc/racko-agent/baseline.json"
}

// BaselineExists returns true if the baseline has already been captured for this agent.
func BaselineExists() bool {
	_, err := os.Stat(baselineFilePath())
	return err == nil
}

// CaptureAndUpload takes a full baseline snapshot, saves it locally, and uploads it
// to the server. Called once on first registration.
func CaptureAndUpload(agentID string, cfg *config.Config) error {
	log.Println("[tracker/baseline] Capturing baseline snapshot...")

	b := &Baseline{
		AgentID:    agentID,
		CapturedAt: time.Now().UTC(),
	}

	b.InstalledApps = collectInstalledApps()
	log.Printf("[tracker/baseline] Collected %d installed apps", len(b.InstalledApps))

	b.Files = collectUserFiles()
	log.Printf("[tracker/baseline] Collected %d file entries", len(b.Files))

	b.SystemEnvVars = collectEnvVars("Machine")
	b.UserEnvVars = collectEnvVars("User")
	log.Printf("[tracker/baseline] Collected %d system + %d user env vars",
		len(b.SystemEnvVars), len(b.UserEnvVars))

	b.ScheduledTasks = collectScheduledTasks()
	log.Printf("[tracker/baseline] Collected %d scheduled tasks", len(b.ScheduledTasks))

	b.Services = collectServices()
	log.Printf("[tracker/baseline] Collected %d services", len(b.Services))

	b.ProgramFolders = collectTopLevelFolders(`C:\Program Files`)
	b.ProgramFolders = append(b.ProgramFolders, collectTopLevelFolders(`C:\Program Files (x86)`)...)
	b.ProgramDataFolders = collectTopLevelFolders(`C:\ProgramData`)

	// Save locally first — survives server downtime
	if err := saveBaseline(b); err != nil {
		log.Printf("[tracker/baseline] WARNING: could not save baseline locally: %v", err)
	}

	// Upload to server
	if err := uploadBaseline(b, agentID, cfg); err != nil {
		log.Printf("[tracker/baseline] WARNING: could not upload baseline to server: %v", err)
		// Non-fatal — we have the local copy and will retry on reconnect
	} else {
		log.Println("[tracker/baseline] Baseline uploaded to server successfully")
	}

	return nil
}

// LoadLocal reads the locally saved baseline from disk.
func LoadLocal() (*Baseline, error) {
	data, err := os.ReadFile(baselineFilePath())
	if err != nil {
		return nil, err
	}
	var b Baseline
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, err
	}
	return &b, nil
}

// ─── Collection helpers ───────────────────────────────────────────────────────

// collectInstalledApps reads all installed apps from the Windows registry via PowerShell.
func collectInstalledApps() []InstalledApp {
	script := `
$paths = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$apps = $paths | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName } |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, UninstallString |
    Sort-Object DisplayName -Unique
$apps | ConvertTo-Json -Depth 2 -Compress
`
	out := runPS(script)
	if out == "" {
		return nil
	}
	// PowerShell may return a single object (not array) if only one app
	out = strings.TrimSpace(out)
	if len(out) > 0 && out[0] == '{' {
		out = "[" + out + "]"
	}
	var apps []InstalledApp
	_ = json.Unmarshal([]byte(out), &apps)
	return apps
}

// collectUserFiles walks the watched paths and records each file's path + SHA256 hash.
// This is the initial baseline scan — subsequent changes are tracked by the watcher.
func collectUserFiles() []FileEntry {
	var entries []FileEntry
	watchPaths := getWatchPaths()
	for _, root := range watchPaths {
		if _, err := os.Stat(root); err != nil {
			continue
		}
		_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // skip unreadable paths
			}
			if d.IsDir() {
				if shouldExcludePath(path) {
					return filepath.SkipDir
				}
				return nil
			}
			if shouldExcludePath(path) {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			hash := hashFile(path)
			entries = append(entries, FileEntry{
				Path:      path,
				SHA256:    hash,
				SizeBytes: info.Size(),
			})
			return nil
		})
	}
	return entries
}

// collectEnvVars reads system or user environment variables via PowerShell.
// scope is "Machine" or "User".
func collectEnvVars(scope string) []EnvVar {
	script := fmt.Sprintf(`
[System.Environment]::GetEnvironmentVariables('%s').GetEnumerator() |
    Select-Object -Property @{N='key';E={$_.Key}}, @{N='value';E={$_.Value}} |
    ConvertTo-Json -Compress
`, scope)
	out := runPS(script)
	if out == "" {
		return nil
	}
	out = strings.TrimSpace(out)
	if len(out) > 0 && out[0] == '{' {
		out = "[" + out + "]"
	}
	var vars []EnvVar
	_ = json.Unmarshal([]byte(out), &vars)
	return vars
}

// collectScheduledTasks returns all non-Microsoft scheduled tasks.
func collectScheduledTasks() []ScheduledTaskEntry {
	script := `
Get-ScheduledTask -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskPath -notlike '\Microsoft*' -and $_.TaskPath -notlike '\Windows*' } |
    Select-Object TaskName, TaskPath, @{N='State';E={$_.State.ToString()}} |
    ConvertTo-Json -Compress
`
	out := runPS(script)
	if out == "" {
		return nil
	}
	out = strings.TrimSpace(out)
	if len(out) > 0 && out[0] == '{' {
		out = "[" + out + "]"
	}
	var tasks []ScheduledTaskEntry
	_ = json.Unmarshal([]byte(out), &tasks)
	return tasks
}

// collectServices returns all non-Windows services.
func collectServices() []ServiceEntry {
	script := `
Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike 'Racko*' -and $_.PathName } |
    Select-Object Name, State, StartMode, PathName |
    ConvertTo-Json -Compress
`
	out := runPS(script)
	if out == "" {
		return nil
	}
	out = strings.TrimSpace(out)
	if len(out) > 0 && out[0] == '{' {
		out = "[" + out + "]"
	}

	type rawSvc struct {
		Name      string `json:"Name"`
		State     string `json:"State"`
		StartMode string `json:"StartMode"`
		PathName  string `json:"PathName"`
	}
	var raw []rawSvc
	_ = json.Unmarshal([]byte(out), &raw)

	svcs := make([]ServiceEntry, 0, len(raw))
	for _, r := range raw {
		svcs = append(svcs, ServiceEntry{
			Name:       r.Name,
			State:      r.State,
			StartType:  r.StartMode,
			BinaryPath: r.PathName,
		})
	}
	return svcs
}

// collectTopLevelFolders returns the names of all top-level directories under root.
func collectTopLevelFolders(root string) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names
}

// ─── Persistence & upload ─────────────────────────────────────────────────────

func saveBaseline(b *Baseline) error {
	data, err := json.Marshal(b)
	if err != nil {
		return err
	}
	dir := filepath.Dir(baselineFilePath())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(baselineFilePath(), data, 0o600)
}

func uploadBaseline(b *Baseline, agentID string, cfg *config.Config) error {
	// Split the baseline into chunks to avoid nginx body size limits.
	// The files array can have thousands of entries (4000+ on a typical VM).
	// We send the metadata first, then the file list in pages of 500.
	// Each chunk is identified by chunkIndex + totalChunks so the server
	// can assemble them in order.

	const filePageSize = 500

	// Build the base payload without files (always fits under 1MB)
	base := *b
	base.Files = nil

	totalFileChunks := (len(b.Files) + filePageSize - 1) / filePageSize
	if totalFileChunks == 0 {
		totalFileChunks = 1
	}

	type chunkPayload struct {
		Baseline    *Baseline `json:"baseline"`
		ChunkIndex  int       `json:"chunkIndex"`  // 0-based
		TotalChunks int       `json:"totalChunks"`
		FileChunk   []FileEntry `json:"fileChunk,omitempty"`
	}

	client := &http.Client{Timeout: 120 * time.Second}
	url := cfg.PlatformURL + "/api/v1/agent/baseline"

	// Chunk 0: full metadata + first file page
	for i := 0; i < totalFileChunks; i++ {
		start := i * filePageSize
		end := start + filePageSize
		if end > len(b.Files) {
			end = len(b.Files)
		}

		var chunk chunkPayload
		if i == 0 {
			// First chunk carries all metadata
			chunk = chunkPayload{
				Baseline:    &base,
				ChunkIndex:  0,
				TotalChunks: totalFileChunks,
				FileChunk:   b.Files[start:end],
			}
		} else {
			// Subsequent chunks carry only the file page
			chunk = chunkPayload{
				Baseline:    nil,
				ChunkIndex:  i,
				TotalChunks: totalFileChunks,
				FileChunk:   b.Files[start:end],
			}
		}

		body, err := json.Marshal(chunk)
		if err != nil {
			return fmt.Errorf("marshal chunk %d: %w", i, err)
		}

		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Agent-ID", agentID)

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("http chunk %d: %w", i, err)
		}
		body2, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			return fmt.Errorf("server returned %d on chunk %d: %s", resp.StatusCode, i, string(body2))
		}
		log.Printf("[tracker/baseline] Uploaded chunk %d/%d (%d files)", i+1, totalFileChunks, end-start)
	}
	return nil
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

// runPS executes a PowerShell script and returns its stdout output.
func runPS(script string) string {
	if runtime.GOOS != "windows" {
		return ""
	}
	cmd := exec.Command("powershell.exe",
		"-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// hashFile computes the SHA256 of the file at path, returns hex string.
// Returns empty string on any error (unreadable files, locked, etc.)
func hashFile(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return ""
	}
	return hex.EncodeToString(h.Sum(nil))
}

// getWatchPaths returns the allowlisted root paths the tracker watches for changes.
//
// ALLOWLIST-FIRST DESIGN: Only paths explicitly listed here are ever tracked.
// The USN journal watcher uses this list as a primary gate — any file event
// whose path does not start with one of these roots is discarded immediately,
// before the denylist is even consulted. This means C:\Program Files,
// C:\ProgramData, C:\Windows and everything else outside these roots is
// silently ignored regardless of what software installs or what Windows does.
//
// To add a new tracked location, add it here. The denylist (shouldExcludeWithinScope)
// only needs to handle noise inside these paths — it never needs to mention
// Program Files or OS paths again.
func getWatchPaths() []string {
	return []string{
		`C:\Users`,
		`C:\tools`,
		`C:\dev`,
		`C:\projects`,
		`C:\workspace`,
		`C:\src`,
	}
}

// isInWatchScope returns true when path falls under one of the allowlisted
// watch roots. This is the PRIMARY filter — it must be checked before
// shouldExcludeWithinScope. Files outside the watch scope are never tracked
// regardless of the denylist.
//
// Uses case-insensitive prefix matching. The separator check (path[len(root)]
// is '\' or path == root exactly) prevents false positives like
// C:\UsersBackup matching the C:\Users root.
func isInWatchScope(path string) bool {
	lp := strings.ToLower(path)
	for _, root := range getWatchPaths() {
		lr := strings.ToLower(root)
		if lp == lr {
			return true
		}
		// Must be a proper sub-path: root\ prefix, not just a string prefix match
		if strings.HasPrefix(lp, lr+`\`) {
			return true
		}
	}
	return false
}

// shouldExcludeWithinScope returns true for paths that are inside the watch
// scope but should still be ignored — OS-managed noise, caches, lock files,
// and transient files that have no value for clone replay.
//
// IMPORTANT: This function is only called AFTER isInWatchScope returns true.
// It must never need to mention C:\Program Files, C:\Windows, C:\ProgramData,
// or any path outside the watch roots — those are handled by the allowlist.
func shouldExcludeWithinScope(path string) bool {
	lp := strings.ToLower(path)

	// ── Excluded subtrees (prefix match) ──────────────────────────────────────

	excludePrefixes := []string{
		// Public / shared user profiles — not a real user's content
		`c:\users\public\`,
		`c:\users\all users\`,
		`c:\users\default\`,
		`c:\users\default user\`,

		// AppData entirely — software stores internal data here (caches, settings,
		// updaters, logs). Users don't manually create content in AppData.
		// This single rule covers Chrome, VS Code, Office, every vendor — no
		// per-app exclusion rules needed.
		`\appdata\`,

		// Agent data — never track our own files
		`c:\programdata\racko-agent\`,
	}

	for _, prefix := range excludePrefixes {
		if strings.HasPrefix(lp, prefix) || strings.Contains(lp, prefix) {
			return true
		}
	}

	// ── Excluded file suffixes / name fragments (noise files) ─────────────────

	excludeFragments := []string{
		// Registry hive files — always locked by Windows, never readable
		`ntuser.dat`,
		`ntuser.dat.log`,
		`ntuser.pol`,
		// NTFS system entries
		`$extend`,
		`$deleted`,
		`$recycle.bin`,
		`system volume information`,
		// Office lock files (~ prefix, e.g. ~$document.docx)
		`~$`,
		// Partial / temporary download files
		`.tmp`,
		`.crdownload`, // Chrome/Edge partial downloads
		`.part`,       // Firefox partial downloads
		// ESE / IndexedDB internal files (search index etc.)
		`.jfm`,
		`edb.chk`,
		`edb.log`,
		// Paging / hibernation — never user content
		`hiberfil.sys`,
		`swapfile.sys`,
		`pagefile.sys`,
	}

	for _, frag := range excludeFragments {
		if strings.Contains(lp, frag) {
			return true
		}
	}

	return false
}

// shouldExcludePath is the legacy entry point kept for callers in baseline.go
// (collectUserFiles walk). It applies both the scope check and the within-scope
// denylist so the baseline file scan stays consistent with the live watcher.
//
// New code (USN watcher) should call isInWatchScope + shouldExcludeWithinScope
// directly for clarity and early-exit efficiency.
func shouldExcludePath(path string) bool {
	if !isInWatchScope(path) {
		return true // outside allowlist → exclude
	}
	return shouldExcludeWithinScope(path)
}
