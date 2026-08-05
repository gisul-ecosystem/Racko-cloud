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
	"strings"
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
	inFlightSHA, err := downloadBinary(cfg.PlatformURL, tmpPath)
	if err != nil {
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
	// Use the SHA computed during download (via io.TeeReader) — this avoids any
	// Windows file-system read-after-write race that would occur if we re-opened
	// the file to hash it separately.
	if expectedSHA != "" {
		// Trim any whitespace/newlines that might have been introduced during
		// CI artifact file reads or environment variable interpolation.
		expectedSHA = strings.TrimSpace(expectedSHA)
		log.Printf("[updater] Checksum: expected=%s got=%s", expectedSHA, inFlightSHA)
		if inFlightSHA != expectedSHA {
			log.Printf("[updater] Checksum MISMATCH — aborting")
			return
		}
		log.Printf("[updater] Checksum verified OK")
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

func downloadBinary(platformURL, destPath string) (actualSHA string, err error) {
	url := platformURL + "/api/v1/agent/binary/windows"
	client := &http.Client{Timeout: 10 * time.Minute}

	req, reqErr := http.NewRequest(http.MethodGet, url, nil)
	if reqErr != nil {
		return "", fmt.Errorf("build request: %w", reqErr)
	}
	req.Header.Set("Accept-Encoding", "identity")

	resp, respErr := client.Do(req)
	if respErr != nil {
		return "", fmt.Errorf("http get: %w", respErr)
	}
	defer resp.Body.Close()

	log.Printf("[updater] Download response: status=%d content-encoding=%q content-length=%d",
		resp.StatusCode, resp.Header.Get("Content-Encoding"), resp.ContentLength)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server returned %d", resp.StatusCode)
	}

	f, createErr := os.Create(destPath)
	if createErr != nil {
		return "", fmt.Errorf("create temp file: %w", createErr)
	}

	// Hash during download — avoids file system read-after-write race on Windows.
	// io.TeeReader streams bytes to both the hasher and the file simultaneously.
	h := sha256.New()
	tee := io.TeeReader(resp.Body, h)

	written, copyErr := io.Copy(f, tee)

	syncErr := f.Sync()
	closeErr := f.Close()

	if copyErr != nil {
		return "", fmt.Errorf("write binary: %w", copyErr)
	}
	if syncErr != nil {
		log.Printf("[updater] Warning: file sync failed: %v", syncErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close file: %w", closeErr)
	}

	computed := hex.EncodeToString(h.Sum(nil))
	log.Printf("[updater] Download complete: wrote %d bytes, in-flight SHA256=%s", written, computed)
	return computed, nil
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
