// Package updater handles in-place agent binary replacement.
//
// Update flow:
//  1. Download new binary from platform to a temp file
//  2. Verify SHA256 checksum against the value the server provided
//  3. Stop the Windows service
//  4. Replace the running binary with the downloaded one
//  5. Start the Windows service
//  6. Exit — the new binary takes over
//
// All data files (config.json, baseline.json, usn checkpoints, agentId) are
// preserved. Only the executable is replaced.
package updater

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/racko-ai/agent/config"
)

// Update downloads the new binary, verifies its checksum, replaces the current
// binary, and exits. The Windows Service Control Manager automatically restarts
// the service with the new binary.
//
// Why no sc.exe stop/start:
//   This code runs INSIDE the Windows service. Calling "sc stop RackoAgent"
//   from within the service itself causes a deadlock — the SCM waits for the
//   process to exit before completing the stop, but the process is waiting for
//   sc.exe to return. Instead, we replace the binary on disk (Windows allows
//   replacing a running exe file), then call os.Exit(0). The SCM detects the
//   unexpected exit and restarts the service — which now loads the new binary.
//
// platformURL  — base URL to download from (GET /api/v1/agent/binary/<os>)
// expectedSHA  — hex-encoded SHA256 that the server provided; empty = skip check
// cancel       — called to stop all other goroutines before replacing the binary
func Update(cfg *config.Config, expectedSHA string, cancel func()) {
	log.Printf("[updater] Starting in-place update (current=%s)", config.Version)

	if runtime.GOOS != "windows" {
		log.Printf("[updater] Non-Windows OS — skipping auto-update (implement for your platform)")
		return
	}

	// ── Step 1: determine paths ───────────────────────────────────────────────
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[updater] Could not resolve executable path: %v — aborting", err)
		return
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		log.Printf("[updater] Could not eval symlinks for exe: %v — aborting", err)
		return
	}

	tmpPath := exe + ".new"
	bakPath := exe + ".bak"

	// ── Step 2: download new binary ───────────────────────────────────────────
	log.Printf("[updater] Downloading new binary from %s", cfg.PlatformURL)
	if err := downloadBinary(cfg.PlatformURL, tmpPath); err != nil {
		log.Printf("[updater] Download failed: %v — aborting", err)
		return
	}
	// Clean up temp file on any error path
	downloaded := true
	defer func() {
		if downloaded {
			_ = os.Remove(tmpPath)
		}
	}()

	// ── Step 3: verify checksum ───────────────────────────────────────────────
	if expectedSHA != "" {
		actualSHA, err := sha256File(tmpPath)
		if err != nil {
			log.Printf("[updater] Checksum read failed: %v — aborting", err)
			return
		}
		if actualSHA != expectedSHA {
			log.Printf("[updater] Checksum MISMATCH — expected=%s got=%s — aborting", expectedSHA, actualSHA)
			return
		}
		log.Printf("[updater] Checksum verified: %s", actualSHA)
	} else {
		log.Printf("[updater] No checksum provided — skipping verification")
	}

	// ── Step 4: stop all goroutines ───────────────────────────────────────────
	// Cancel heartbeat, watcher, poller etc. so they don't interfere.
	log.Printf("[updater] Stopping agent goroutines before binary replacement")
	if cancel != nil {
		cancel()
	}
	time.Sleep(1 * time.Second) // let goroutines observe cancel and wind down

	// ── Step 5: replace binary on disk ───────────────────────────────────────
	// Windows allows renaming/replacing a running exe file — the OS keeps the
	// old inode open for the running process while the new file takes its place.
	// Back up current binary first so we can restore if rename fails.
	_ = os.Remove(bakPath)
	if err := os.Rename(exe, bakPath); err != nil {
		log.Printf("[updater] Could not back up current binary: %v — aborting (service unchanged)", err)
		return
	}

	if err := os.Rename(tmpPath, exe); err != nil {
		log.Printf("[updater] Could not replace binary: %v — rolling back", err)
		if rbErr := os.Rename(bakPath, exe); rbErr != nil {
			log.Printf("[updater] Rollback also failed: %v — service may need manual repair", rbErr)
		}
		return
	}
	downloaded = false // tmpPath was moved to exe, no need to remove it

	// Remove backup on success
	_ = os.Remove(bakPath)
	log.Printf("[updater] Binary replaced successfully")

	// ── Step 6: exit — SCM restarts the service with the new binary ──────────
	// The Windows Service Control Manager is configured to restart the service
	// on unexpected exit (SC_ACTION_RESTART). When we exit here the SCM detects
	// the exit, waits the configured restart delay, then starts a fresh process
	// from the same binary path — which now contains the new version.
	// No sc.exe stop/start needed — and avoids the self-stop deadlock.
	log.Printf("[updater] Update complete — exiting so SCM restarts with new binary")
	os.Exit(0)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func downloadBinary(platformURL, destPath string) error {
	url := platformURL + "/api/v1/agent/binary/windows"
	client := &http.Client{Timeout: 10 * time.Minute} // large binary, generous timeout

	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, resp.Body); err != nil {
		return fmt.Errorf("write binary: %w", err)
	}
	return nil
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
