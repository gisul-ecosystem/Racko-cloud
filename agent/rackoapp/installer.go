// Package rackoapp handles initial installation and version tracking for the
// racko-app GUI application on Windows.
//
// Install flow:
//  1. Download racko-app.zip using Go net/http (10-min timeout, no hang risk)
//  2. Extract to C:\ProgramData\racko-agent\racko-app\
//  3. Check WebView2 runtime via registry — install from Microsoft if missing
//  4. Create desktop shortcut at %PUBLIC%\Desktop\Racko Shared Files.lnk
//  5. Launch racko-app.exe for the logged-in user
//  6. Write racko-app-version.txt so heartbeat version tracking works
package rackoapp

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/download"
)

const (
	installDir  = `C:\ProgramData\racko-agent`
	appDir      = `C:\ProgramData\racko-agent\racko-app`
	appExe      = `C:\ProgramData\racko-agent\racko-app\racko-app.exe`
	versionFile = `C:\ProgramData\racko-agent\racko-app-version.txt`
	// WebView2 GUID in registry — present on all Windows versions when WV2 is installed
	webView2RegKey = `SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
)

// Install performs a full first-time racko-app installation.
// Safe to call from a goroutine — all steps are idempotent.
// Returns nil on success, error on any failure.
func Install(cfg *config.Config, appVersion string) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("racko-app install is Windows-only")
	}

	log.Printf("[rackoapp/installer] Starting racko-app install (version=%s)", appVersion)

	zipPath := filepath.Join(installDir, "racko-app-install.zip")

	// ── Step 1: clean up any previous partial download ────────────────────────
	_ = os.Remove(zipPath)

	// ── Step 2: download racko-app.zip ────────────────────────────────────────
	log.Printf("[rackoapp/installer] Downloading racko-app.zip from %s", cfg.PlatformURL)
	if err := downloadZip(cfg.PlatformURL, zipPath); err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer os.Remove(zipPath)
	log.Printf("[rackoapp/installer] Download complete")

	// ── Step 3: extract zip ───────────────────────────────────────────────────
	log.Printf("[rackoapp/installer] Extracting to %s", appDir)
	if err := extractZip(zipPath, appDir); err != nil {
		return fmt.Errorf("extract: %w", err)
	}
	log.Printf("[rackoapp/installer] Extraction complete")

	// ── Step 4: install WebView2 if not present ───────────────────────────────
	if err := ensureWebView2(installDir); err != nil {
		// Non-fatal — racko-app may still work if WebView2 was installed by another means
		log.Printf("[rackoapp/installer] WebView2 install warning (non-fatal): %v", err)
	}

	// ── Step 5: create desktop shortcut ──────────────────────────────────────
	if err := createShortcut(appExe, appDir); err != nil {
		// Non-fatal — app works without the shortcut
		log.Printf("[rackoapp/installer] Shortcut creation warning (non-fatal): %v", err)
	}

	// ── Step 6: write version file ────────────────────────────────────────────
	// Must happen before launching so InstalledVersion() returns the correct value
	// on the next heartbeat, preventing a redundant update cycle.
	if appVersion != "" {
		if err := os.WriteFile(versionFile, []byte(appVersion), 0o644); err != nil {
			log.Printf("[rackoapp/installer] Warning: could not write version file: %v", err)
		}
	}

	// ── Step 7: launch racko-app.exe ──────────────────────────────────────────
	log.Printf("[rackoapp/installer] Launching racko-app.exe")
	if err := launchApp(appExe); err != nil {
		// Non-fatal — app is installed and will launch on next desktop session
		log.Printf("[rackoapp/installer] Launch warning (non-fatal): %v", err)
	}

	log.Printf("[rackoapp/installer] racko-app installation complete (version=%s)", appVersion)
	return nil
}

// ─── download ────────────────────────────────────────────────────────────────

func downloadZip(platformURL, destPath string) error {
	url := platformURL + "/api/v1/agent/binary/racko-app"
	// download.File handles idle timeout, retry, progress logging, and cleanup.
	_, err := download.File(url, destPath, "racko-app.zip")
	return err
}

// ─── extract ─────────────────────────────────────────────────────────────────

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
		// Zip-slip guard
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

// ─── WebView2 ─────────────────────────────────────────────────────────────────

// ensureWebView2 checks if WebView2 runtime is installed via registry.
// If not present, downloads the evergreen bootstrapper and runs a silent install.
// The bootstrapper is tiny (~1.6MB) and determines the correct architecture itself.
func ensureWebView2(installDir string) error {
	// Check registry — PowerShell is the cleanest way to read HKLM on all Windows versions
	checkScript := fmt.Sprintf(
		`(Get-ItemProperty -Path "HKLM:\%s" -Name pv -ErrorAction SilentlyContinue).pv`,
		webView2RegKey,
	)
	out, _ := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", checkScript).Output()
	ver := strings.TrimSpace(string(out))

	if ver != "" && ver != "0.0.0.0" {
		log.Printf("[rackoapp/installer] WebView2 already installed (version=%s) — skipping", ver)
		return nil
	}

	log.Printf("[rackoapp/installer] WebView2 not found — installing...")

	// Download the evergreen bootstrapper using the same resilient downloader
	wv2Path := filepath.Join(installDir, "WebView2Setup.exe")
	defer os.Remove(wv2Path)

	if _, err := download.File(
		"https://go.microsoft.com/fwlink/p/?LinkId=2124703",
		wv2Path,
		"WebView2Setup.exe",
	); err != nil {
		return fmt.Errorf("download WebView2 bootstrapper: %w", err)
	}

	// Run silent install — blocks until complete (typically 30-60s on first install)
	cmd := exec.Command(wv2Path, "/silent", "/install")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("WebView2 installer failed: %v — %s", err, string(out))
	}

	log.Printf("[rackoapp/installer] WebView2 installed successfully")
	return nil
}

// ─── shortcut ────────────────────────────────────────────────────────────────

func createShortcut(exePath, workDir string) error {
	// PUBLIC desktop is shared across all users — correct for SYSTEM-installed apps
	publicDesktop := os.Getenv("PUBLIC")
	if publicDesktop == "" {
		publicDesktop = `C:\Users\Public`
	}
	lnkPath := filepath.Join(publicDesktop, "Desktop", "Racko Shared Files.lnk")

	script := fmt.Sprintf(`
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut('%s')
$sc.TargetPath = '%s'
$sc.WorkingDirectory = '%s'
$sc.Description = 'Racko Shared Files'
$sc.Save()
`, lnkPath, exePath, workDir)

	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("shortcut: %v — %s", err, string(out))
	}
	return nil
}

// ─── launch ──────────────────────────────────────────────────────────────────

func launchApp(exePath string) error {
	// Start-Process detaches from the SYSTEM service session so the app
	// appears in the interactive user's desktop session.
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-Command", fmt.Sprintf(`Start-Process "%s"`, exePath))
	return cmd.Start() // fire-and-forget
}
