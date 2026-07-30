package tracker

// replayer.go — receives a clone_replay command from the server and replays
// the source VM's activity log onto this VM.
//
// Only user file changes are replayed:
//   1. File writes  (downloaded from SeaweedFS, written to the exact same path)
//   2. File deletes
//   3. File renames
//
// Registry changes, env var changes, and software installs are NOT replayed —
// the clone feature focuses on user files only.

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
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

// Run fetches the manifest from the server and replays all file activities.
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

	// ── Phase 1: File writes ──────────────────────────────────────────────────
	r.sendEvent("clone_progress", 1, "Restoring files...", false, "")
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

	// ── Phase 2: File deletes ─────────────────────────────────────────────────
	r.sendEvent("clone_progress", 2, "Applying file deletions...", false, "")
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

	// ── Phase 3: File renames ─────────────────────────────────────────────────
	r.sendEvent("clone_progress", 3, "Applying file renames...", false, "")
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
