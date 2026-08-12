// Package appupdater handles in-place racko-app (GUI) updates on Windows.
//
// Flow mirrors the initial install but replaces the existing folder:
//  1. Download racko-app.zip from the platform
//  2. Verify SHA256 checksum
//  3. Stop the racko-app process
//  4. Extract zip to racko-app.new/
//  5. Swap racko-app → racko-app.bak, racko-app.new → racko-app
//  6. Write racko-app-version.txt
//  7. Relaunch racko-app.exe
package appupdater

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/download"
)

var updateMu sync.Mutex

// Update downloads racko-app.zip, verifies checksum, replaces the install folder,
// and relaunches the app. Safe to call from a goroutine on each heartbeat tick —
// concurrent calls are serialized and skipped if an update is already running.
func Update(cfg *config.Config, latestVersion, expectedSHA string) {
	if runtime.GOOS != "windows" {
		return
	}

	if !updateMu.TryLock() {
		log.Printf("[appupdater] Update already in progress — skipping")
		return
	}
	defer updateMu.Unlock()

	log.Printf("[appupdater] Starting racko-app update to version %s", latestVersion)

	const installDir = `C:\ProgramData\racko-agent`
	appDir := filepath.Join(installDir, "racko-app")
	appDirNew := filepath.Join(installDir, "racko-app.new")
	appDirBak := filepath.Join(installDir, "racko-app.bak")
	zipPath := filepath.Join(installDir, "racko-app-update.zip")
	versionFile := filepath.Join(installDir, "racko-app-version.txt")

	// ── Step 1: download zip ──────────────────────────────────────────────────
	if err := downloadZip(cfg.PlatformURL, zipPath); err != nil {
		log.Printf("[appupdater] Download failed: %v", err)
		return
	}
	defer os.Remove(zipPath)

	// ── Step 2: verify checksum ───────────────────────────────────────────────
	if expectedSHA != "" {
		expectedSHA = strings.TrimSpace(expectedSHA)
		got, err := fileSHA256(zipPath)
		if err != nil {
			log.Printf("[appupdater] Hash failed: %v", err)
			return
		}
		if got != expectedSHA {
			log.Printf("[appupdater] Checksum MISMATCH — expected=%s got=%s", expectedSHA, got)
			return
		}
		log.Printf("[appupdater] Checksum verified OK")
	}

	// ── Step 3: stop racko-app ────────────────────────────────────────────────
	stopApp()
	time.Sleep(2 * time.Second)

	// ── Step 4: extract to .new ───────────────────────────────────────────────
	_ = os.RemoveAll(appDirNew)
	if err := extractZip(zipPath, appDirNew); err != nil {
		log.Printf("[appupdater] Extract failed: %v", err)
		return
	}

	// ── Step 5: folder swap ───────────────────────────────────────────────────
	_ = os.RemoveAll(appDirBak)
	if _, err := os.Stat(appDir); err == nil {
		if err := os.Rename(appDir, appDirBak); err != nil {
			log.Printf("[appupdater] Backup rename failed: %v", err)
			_ = os.RemoveAll(appDirNew)
			return
		}
	}
	if err := os.Rename(appDirNew, appDir); err != nil {
		log.Printf("[appupdater] Swap failed: %v — rolling back", err)
		if _, statErr := os.Stat(appDirBak); statErr == nil {
			_ = os.Rename(appDirBak, appDir)
		}
		return
	}
	_ = os.RemoveAll(appDirBak)

	// ── Step 6: persist version ───────────────────────────────────────────────
	if err := os.WriteFile(versionFile, []byte(latestVersion), 0o644); err != nil {
		log.Printf("[appupdater] Warning: could not write version file: %v", err)
	}

	// ── Step 7: relaunch ──────────────────────────────────────────────────────
	exePath := filepath.Join(appDir, "racko-app.exe")
	if _, err := os.Stat(exePath); err != nil {
		log.Printf("[appupdater] racko-app.exe not found after update: %v", err)
		return
	}
	startApp(exePath)

	log.Printf("[appupdater] racko-app updated successfully to %s", latestVersion)
}

func downloadZip(platformURL, destPath string) error {
	url := platformURL + "/api/v1/agent/binary/racko-app"
	// download.File handles idle timeout, retry, progress logging, and cleanup.
	_, err := download.File(url, destPath, "racko-app-update.zip")
	return err
}

func fileSHA256(path string) (string, error) {
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

func extractZip(zipPath, destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return err
	}

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		target := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(target), filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal path in zip: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, f.Mode().Perm())
		if err != nil {
			rc.Close()
			return err
		}

		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func stopApp() {
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
		`Stop-Process -Name "racko-app" -Force -ErrorAction SilentlyContinue`)
	_ = cmd.Run()
}

func startApp(exePath string) {
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
		fmt.Sprintf(`Start-Process "%s"`, exePath))
	if err := cmd.Start(); err != nil {
		log.Printf("[appupdater] Failed to relaunch racko-app: %v", err)
	}
}
