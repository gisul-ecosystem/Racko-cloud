//go:build windows

package installer

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// directInstallTimeout is applied to msi/exe/zip/script installs where we
// spawn the process directly with no built-in timeout of their own.
const directInstallTimeout = 4 * time.Hour

func installOnPlatform(pkg SoftwarePackage) (string, error) {
	switch pkg.InstallMethod {
	case "winget":
		return runWinget(pkg)
	case "choco":
		return runChoco(pkg)
	case "msi":
		return runMSI(pkg)
	case "exe":
		return runEXE(pkg)
	case "zip":
		return runZIP(pkg)
	case "script":
		return runPowerShell(pkg)
	default:
		return "", fmt.Errorf("unsupported install method on Windows: %s", pkg.InstallMethod)
	}
}

// ensureChocolatey installs Chocolatey if not already present.
func ensureChocolatey() (string, error) {
	if _, err := exec.LookPath("choco"); err == nil {
		return "", nil
	}
	chocoExe := `C:\ProgramData\chocolatey\bin\choco.exe`
	if _, err := os.Stat(chocoExe); err == nil {
		return "", nil
	}
	installScript := `[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))`
	out, err := runCmd("powershell.exe",
		"-ExecutionPolicy", "Bypass",
		"-NonInteractive",
		"-Command", installScript,
	)
	if err != nil {
		return out, fmt.Errorf("chocolatey install failed: %w", err)
	}
	return out, nil
}

// runWinget installs via winget with no timeout — winget manages itself.
// Falls back to choco if winget is unavailable.
func runWinget(pkg SoftwarePackage) (string, error) {
	wingetID := pkg.WingetID
	if wingetID == "" {
		wingetID = pkg.Name
	}

	wingetPath, err := exec.LookPath("winget")
	if err != nil {
		if pkg.ChocoName != "" || pkg.Name != "" {
			return runChoco(pkg)
		}
		return "", fmt.Errorf("winget not found and no choco fallback available")
	}

	args := []string{"install", "--id", wingetID, "-e",
		"--accept-source-agreements", "--accept-package-agreements", "--silent"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	cmd := exec.Command(wingetPath, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()

	combined := fmt.Sprintf("cmd: winget %v\nstdout:\n%s\nstderr:\n%s",
		args, stdout.String(), stderr.String())

	if err == nil {
		return combined, nil
	}

	outLower := strings.ToLower(stdout.String() + stderr.String())
	for _, signal := range alreadyInstalledSignals {
		if strings.Contains(outLower, signal) {
			return combined, nil
		}
	}

	return combined, fmt.Errorf("winget exited with error: %w", err)
}

// runChoco installs via choco with no timeout — choco manages itself.
func runChoco(pkg SoftwarePackage) (string, error) {
	installLog, err := ensureChocolatey()
	if err != nil {
		return installLog, fmt.Errorf("ensure chocolatey: %w", err)
	}

	name := pkg.ChocoName
	if name == "" {
		name = pkg.Name
	}
	args := []string{"install", name, "-y", "--no-progress"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	out, err := runCmd(`C:\ProgramData\chocolatey\bin\choco.exe`, args...)
	if err != nil {
		out2, err2 := runCmd("choco", args...)
		if err2 != nil {
			combined := installLog + out + out2
			outLower := strings.ToLower(combined)
			for _, signal := range alreadyInstalledSignals {
				if strings.Contains(outLower, signal) {
					log.Printf("[choco] Already installed detected for %s — treating as success", name)
					return combined, nil
				}
			}
			return combined, fmt.Errorf("choco install failed: %w", err2)
		}
		return installLog + out2, nil
	}
	return installLog + out, nil
}

// runMSI downloads and installs a .msi file with a 4-hour safety timeout.
func runMSI(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download msi: %w", err)
	}
	defer cleanup()

	args := []string{"/i", path, "/quiet", "/norestart"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmdWithTimeout(directInstallTimeout, "msiexec", args...)
}

// runEXE downloads and runs a silent .exe installer with a 4-hour safety timeout.
func runEXE(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download exe: %w", err)
	}
	defer cleanup()

	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	return runCmdWithTimeout(directInstallTimeout, path, args...)
}

// runZIP downloads, extracts, and runs the installer with a 4-hour safety timeout.
func runZIP(pkg SoftwarePackage) (string, error) {
	zipPath, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download zip: %w", err)
	}
	defer cleanup()

	extractDir := zipPath + "_extracted"
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return "", fmt.Errorf("create extract dir: %w", err)
	}
	defer os.RemoveAll(extractDir)

	if err := extractZip(zipPath, extractDir); err != nil {
		return "", fmt.Errorf("extract zip: %w", err)
	}

	installerPath := findInstallerInDir(extractDir, []string{"setup.exe", "install.exe", "installer.exe"})
	if installerPath == "" {
		return "", fmt.Errorf("no installer found in zip (expected setup.exe, install.exe, or installer.exe)")
	}

	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	return runCmdWithTimeout(directInstallTimeout, installerPath, args...)
}

// runPowerShell downloads and runs a .ps1 script with a 4-hour safety timeout.
func runPowerShell(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download script: %w", err)
	}
	defer cleanup()

	args := []string{"-ExecutionPolicy", "Bypass", "-NonInteractive", "-File", path}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmdWithTimeout(directInstallTimeout, "powershell.exe", args...)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// alreadyInstalledSignals are choco/winget output strings that indicate the
// package is already present — treated as success (idempotent installs).
var alreadyInstalledSignals = []string{
	"already installed",
	"already exists",
	"package already installed",
	"nothing to install",
	"is already installed",
	"no applicable upgrade found",
	"no available upgrade found",
	"no newer package versions are available",
}

// runCmd runs a command with no timeout (for package managers that self-manage).
func runCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())
	if err != nil {
		log.Printf("[installer] %s failed: %v\noutput: %s", name, err, combined)
		return combined, fmt.Errorf("%s exited with error: %w", name, err)
	}
	return combined, nil
}

// runCmdWithTimeout runs a command with a hard timeout (for direct installers).
func runCmdWithTimeout(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())
	if ctx.Err() == context.DeadlineExceeded {
		return combined, fmt.Errorf("%s timed out after %s", name, timeout)
	}
	if err != nil {
		log.Printf("[installer] %s failed: %v\noutput: %s", name, err, combined)
		return combined, fmt.Errorf("%s exited with error: %w", name, err)
	}
	return combined, nil
}

// downloadFile downloads url to a temp file and returns its path plus a cleanup func.
func downloadFile(url, fileName string) (string, func(), error) {
	if url == "" {
		return "", func() {}, fmt.Errorf("fileUrl is empty")
	}

	resp, err := http.Get(url) // #nosec G107 — URL comes from trusted platform catalog
	if err != nil {
		return "", func() {}, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", func() {}, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	if fileName == "" {
		fileName = "racko_installer_tmp"
	}

	tmp, err := os.CreateTemp("", "racko_*_"+filepath.Base(fileName))
	if err != nil {
		return "", func() {}, fmt.Errorf("create temp file: %w", err)
	}

	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", func() {}, fmt.Errorf("write temp file: %w", err)
	}
	tmp.Close()

	return tmp.Name(), func() { os.Remove(tmp.Name()) }, nil
}

func extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fPath := filepath.Join(destDir, filepath.Clean(f.Name))
		if !strings.HasPrefix(fPath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("invalid file path in zip: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(fPath, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fPath), 0o755); err != nil {
			return err
		}
		out, err := os.Create(fPath)
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			out.Close()
			return err
		}
		_, err = io.Copy(out, rc) // #nosec G110
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func findInstallerInDir(dir string, names []string) string {
	for _, name := range names {
		candidate := filepath.Join(dir, name)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() {
			for _, name := range names {
				candidate := filepath.Join(dir, entry.Name(), name)
				if _, err := os.Stat(candidate); err == nil {
					return candidate
				}
			}
		}
	}
	return ""
}
