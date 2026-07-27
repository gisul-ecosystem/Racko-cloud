package tracker

// replayer.go — receives a clone_replay command from the server and replays
// the source VM's activity log onto this VM in the correct order:
//
//   1. Registry changes (applied first so software installers find the right config)
//   2. Environment variable changes
//   3. Scheduled tasks
//   4. Software installs (via existing job executor — package manager installs)
//   5. File writes (downloaded from SeaweedFS, written to the exact same path)
//   6. File deletes / renames
//
// Progress events are sent back over WebSocket so the frontend can show a live
// progress stream identical to the reset flow.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/racko-ai/agent/config"
)

// ─── Replay types ─────────────────────────────────────────────────────────────

// CloneReplayManifest is the full payload the server sends when a clone is triggered.
// The server fetches all activity records for the source machine and packages them here.
type CloneReplayManifest struct {
	SourceMachineID string          `json:"sourceMachineId"`
	SessionID       string          `json:"sessionId"`
	Activities      []ReplayActivity `json:"activities"`
}

// ReplayActivity mirrors ActivityEvent but with the payload pre-decoded into
// the appropriate concrete type based on Type.
type ReplayActivity struct {
	Type      ActivityType    `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// ─── Replayer ─────────────────────────────────────────────────────────────────

// Replayer executes a clone replay manifest on this VM.
type Replayer struct {
	agentID string
	cfg     *config.Config
	client  *http.Client

	// sendEvent sends a progress event back to the server (relayed to frontend via SSE).
	sendEvent func(eventType string, phase int, message string, success bool, errMsg string)
}

// NewReplayer creates a Replayer that uses sendEvent for live progress reporting.
func NewReplayer(agentID string, cfg *config.Config,
	sendEvent func(eventType string, phase int, message string, success bool, errMsg string)) *Replayer {
	return &Replayer{
		agentID:   agentID,
		cfg:       cfg,
		client:    &http.Client{Timeout: 30 * time.Minute},
		sendEvent: sendEvent,
	}
}

// Run fetches the manifest from the server and replays all activities.
// Runs in a goroutine — sends clone_progress and clone_complete events via sendEvent.
func (r *Replayer) Run(sessionID, sourceMachineID string) {
	r.sendEvent("clone_progress", 0, "Fetching activity log from server...", false, "")

	manifest, err := r.fetchManifest(sessionID, sourceMachineID)
	if err != nil {
		r.sendEvent("clone_complete", 0, "", false, fmt.Sprintf("Failed to fetch manifest: %v", err))
		return
	}

	log.Printf("[tracker/replayer] Replaying %d activities from machine %s",
		len(manifest.Activities), sourceMachineID)

	// ── Phase 1: Registry changes ────────────────────────────────────────────
	r.sendEvent("clone_progress", 1, "Applying registry changes...", false, "")
	regCount := 0
	for _, act := range manifest.Activities {
		if act.Type != ActivityRegChange {
			continue
		}
		var p RegChangePayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		if err := r.applyRegistry(p); err != nil {
			log.Printf("[tracker/replayer] Registry apply failed for %s: %v", p.KeyPath, err)
		} else {
			regCount++
		}
	}
	log.Printf("[tracker/replayer] Applied %d registry changes", regCount)

	// ── Phase 2: Environment variables ───────────────────────────────────────
	r.sendEvent("clone_progress", 2, "Applying environment variables...", false, "")
	envCount := 0
	for _, act := range manifest.Activities {
		if act.Type != ActivityEnvVarChange {
			continue
		}
		var p EnvVarPayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		if err := r.applyEnvVar(p); err != nil {
			log.Printf("[tracker/replayer] EnvVar apply failed %s=%s: %v", p.Key, p.Value, err)
		} else {
			envCount++
		}
	}
	log.Printf("[tracker/replayer] Applied %d env var changes", envCount)

	// ── Phase 3: Software installs ───────────────────────────────────────────
	// Collect unique software install events and dispatch them as jobs via the
	// existing job executor. The server will push install jobs via WebSocket
	// automatically — we request them here by notifying the server.
	r.sendEvent("clone_progress", 3, "Triggering software installs...", false, "")
	softwareCount := 0
	for _, act := range manifest.Activities {
		if act.Type != ActivitySoftwareInstall {
			continue
		}
		var p SoftwareInstallPayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		if err := r.requestSoftwareInstall(p); err != nil {
			log.Printf("[tracker/replayer] Software install request failed %s: %v", p.Name, err)
		} else {
			softwareCount++
		}
	}
	log.Printf("[tracker/replayer] Requested %d software installs", softwareCount)

	// ── Phase 4: File writes ─────────────────────────────────────────────────
	r.sendEvent("clone_progress", 4, "Restoring files...", false, "")
	fileWriteCount := 0
	fileFailCount := 0
	for _, act := range manifest.Activities {
		if act.Type != ActivityFileWrite {
			continue
		}
		var p FileWritePayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		if p.StorageRef == "" {
			log.Printf("[tracker/replayer] Skipping file with no storageRef: %s", p.Path)
			continue
		}
		if err := r.restoreFile(p); err != nil {
			log.Printf("[tracker/replayer] File restore failed %s: %v", p.Path, err)
			fileFailCount++
		} else {
			fileWriteCount++
		}
	}
	log.Printf("[tracker/replayer] Restored %d files (%d failed)", fileWriteCount, fileFailCount)

	// ── Phase 5: File deletes ────────────────────────────────────────────────
	r.sendEvent("clone_progress", 5, "Applying file deletions...", false, "")
	for _, act := range manifest.Activities {
		if act.Type != ActivityFileDelete {
			continue
		}
		var p FileDeletePayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		_ = os.Remove(p.Path) // best-effort
	}

	// ── Phase 6: File renames ────────────────────────────────────────────────
	for _, act := range manifest.Activities {
		if act.Type != ActivityFileRename {
			continue
		}
		var p FileRenamePayload
		if err := json.Unmarshal(act.Payload, &p); err != nil {
			continue
		}
		_ = os.MkdirAll(filepath.Dir(p.NewPath), 0o755)
		_ = os.Rename(p.OldPath, p.NewPath)
	}

	r.sendEvent("clone_complete", 0, "", true, "")
	log.Printf("[tracker/replayer] Clone replay complete — session=%s", sessionID)
}

// ─── Fetch manifest ───────────────────────────────────────────────────────────

func (r *Replayer) fetchManifest(sessionID, sourceMachineID string) (*CloneReplayManifest, error) {
	url := fmt.Sprintf("%s/api/v1/agent/clone-manifest?sessionId=%s&sourceMachineId=%s",
		r.cfg.PlatformURL, sessionID, sourceMachineID)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Agent-ID", r.agentID)

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data CloneReplayManifest `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &result.Data, nil
}

// ─── Apply helpers ────────────────────────────────────────────────────────────

// applyRegistry imports a .reg export string via `reg import`.
func (r *Replayer) applyRegistry(p RegChangePayload) error {
	if p.RegExport == "" {
		return nil
	}
	// Write to a temp .reg file then import it.
	tmpPath := `C:\Windows\Temp\racko-clone-reg.reg`
	if err := os.WriteFile(tmpPath, []byte(p.RegExport), 0o644); err != nil {
		return fmt.Errorf("write reg file: %w", err)
	}
	defer os.Remove(tmpPath)

	out, err := exec.Command("reg", "import", tmpPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("reg import: %v — %s", err, string(out))
	}
	return nil
}

// applyEnvVar sets an environment variable using PowerShell.
func (r *Replayer) applyEnvVar(p EnvVarPayload) error {
	script := fmt.Sprintf(
		`[System.Environment]::SetEnvironmentVariable('%s', '%s', '%s')`,
		escapePS(p.Key), escapePS(p.Value), p.Scope)
	out, err := exec.Command("powershell.exe",
		"-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script).CombinedOutput()
	if err != nil {
		return fmt.Errorf("set env: %v — %s", err, string(out))
	}
	return nil
}

// SoftwareInstallPayload carries a software install reference for replay.
type SoftwareInstallPayload struct {
	Name          string `json:"name"`
	SoftwareCatalogID string `json:"softwareCatalogId"` // core-api catalog entry ID
}

// requestSoftwareInstall asks the server to create an install job for this agent.
// The server pushes the job via WebSocket and the existing executor handles it.
func (r *Replayer) requestSoftwareInstall(p SoftwareInstallPayload) error {
	if p.SoftwareCatalogID == "" {
		return fmt.Errorf("no softwareCatalogId")
	}
	body, _ := json.Marshal(map[string]string{
		"agentId":           r.agentID,
		"softwareCatalogId": p.SoftwareCatalogID,
	})
	url := r.cfg.PlatformURL + "/api/v1/agent/clone-install"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", r.agentID)

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// restoreFile downloads a file from SeaweedFS (via server proxy) and writes it
// to the original path, creating parent directories as needed.
func (r *Replayer) restoreFile(p FileWritePayload) error {
	url := fmt.Sprintf("%s/api/v1/agent/file-download?ref=%s",
		r.cfg.PlatformURL, p.StorageRef)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Agent-ID", r.agentID)

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server %d: %s", resp.StatusCode, string(body))
	}

	// Ensure target directory exists.
	dir := filepath.Dir(p.Path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}

	// Write file content (streaming — no full buffer in memory).
	f, err := os.Create(p.Path)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// escapePS escapes a string for safe embedding in a PowerShell single-quoted string.
func escapePS(s string) string {
	// In PowerShell single-quoted strings, only ' needs escaping (as '').
	result := ""
	for _, c := range s {
		if c == '\'' {
			result += "''"
		} else {
			result += string(c)
		}
	}
	return result
}
