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
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/racko-ai/agent/config"
)

// Update downloads the new binary, verifies its checksum, replaces the current
// binary, and restarts the service. Runs in a goroutine — agent exits at the end
// so the service manager brings up the new version.
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
	defer func() {
		// Always clean up temp file regardless of outcome
		_ = os.Remove(tmpPath)
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
	log.Printf("[updater] Stopping agent goroutines before binary replacement")
	if cancel != nil {
		cancel()
	}
	time.Sleep(1 * time.Second) // let goroutines wind down

	// ── Step 5: stop the service ──────────────────────────────────────────────
	log.Printf("[updater] Stopping RackoAgent service")
	stopCmd := exec.Command("sc.exe", "stop", "RackoAgent")
	if out, err := stopCmd.CombinedOutput(); err != nil {
		log.Printf("[updater] sc stop returned: %v — %s (continuing)", err, string(out))
	}
	time.Sleep(2 * time.Second) // wait for service to stop

	// ── Step 6: replace binary ────────────────────────────────────────────────
	// Back up current binary first so we can roll back on failure.
	_ = os.Remove(bakPath)
	if err := os.Rename(exe, bakPath); err != nil {
		log.Printf("[updater] Could not back up current binary: %v — attempting sc start to recover", err)
		_ = exec.Command("sc.exe", "start", "RackoAgent").Run()
		return
	}

	if err := os.Rename(tmpPath, exe); err != nil {
		log.Printf("[updater] Could not replace binary: %v — rolling back", err)
		// Roll back: restore the backup
		if rbErr := os.Rename(bakPath, exe); rbErr != nil {
			log.Printf("[updater] Rollback also failed: %v — service may need manual restart", rbErr)
		}
		_ = exec.Command("sc.exe", "start", "RackoAgent").Run()
		return
	}

	// Remove backup on success
	_ = os.Remove(bakPath)
	log.Printf("[updater] Binary replaced successfully")

	// ── Step 7: start service ─────────────────────────────────────────────────
	log.Printf("[updater] Starting RackoAgent service with new binary")
	if out, err := exec.Command("sc.exe", "start", "RackoAgent").CombinedOutput(); err != nil {
		log.Printf("[updater] sc start returned: %v — %s", err, string(out))
	}

	log.Printf("[updater] Update complete — new agent process started, exiting old process")
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
