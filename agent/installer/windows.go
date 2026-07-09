//go:build windows

package installer

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

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
// Chocolatey works under the SYSTEM account — winget does not.
func ensureChocolatey() (string, error) {
	// Check if choco is already installed
	if _, err := exec.LookPath("choco"); err == nil {
		return "", nil // already installed
	}

	// Also check the default install path
	chocoExe := `C:\ProgramData\chocolatey\bin\choco.exe`
	if _, err := os.Stat(chocoExe); err == nil {
		return "", nil // already installed
	}

	// Install Chocolatey via PowerShell
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

// runWinget installs via winget. Falls back to choco if winget is not available.
// Treats "already installed" output as success (idempotent).
func runWinget(pkg SoftwarePackage) (string, error) {
	wingetID := pkg.WingetID
	if wingetID == "" {
		wingetID = pkg.Name
	}

	// Check if winget is available
	wingetPath, err := exec.LookPath("winget")
	if err != nil {
		// winget not available — fall back to choco if chocoName is provided
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

	// Winget exits non-zero for some "already installed" cases.
	// Detect these and treat as success.
	outLower := strings.ToLower(stdout.String() + stderr.String())
	alreadyInstalledSignals := []string{
		"no applicable upgrade found",
		"already installed",
		"no available upgrade found",
		"no newer package versions are available",
	}
	for _, signal := range alreadyInstalledSignals {
		if strings.Contains(outLower, signal) {
			return combined, nil // treat as success
		}
	}

	return combined, fmt.Errorf("winget exited with error: %w", err)
}
func runChoco(pkg SoftwarePackage) (string, error) {
	log.Printf("[choco] Starting install for name=%s chocoName=%s version=%s", pkg.Name, pkg.ChocoName, pkg.Version)

	// Auto-install Chocolatey if missing
	log.Printf("[choco] Ensuring chocolatey is installed...")
	installLog, err := ensureChocolatey()
	if err != nil {
		log.Printf("[choco] ERROR ensuring chocolatey: %v", err)
		return installLog, fmt.Errorf("ensure chocolatey: %w", err)
	}
	log.Printf("[choco] Chocolatey ready")

	name := pkg.ChocoName
	if name == "" {
		name = pkg.Name
	}
	args := []string{"install", name, "-y", "--no-progress"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}

	chocoExe := `C:\ProgramData\chocolatey\bin\choco.exe`
	log.Printf("[choco] Running: %s %v", chocoExe, args)
	out, err := runCmd(chocoExe, args...)
	if err != nil {
		log.Printf("[choco] Primary choco path failed: %v — trying PATH fallback", err)
		out2, err2 := runCmd("choco", args...)
		if err2 != nil {
			combined := installLog + out + out2
			log.Printf("[choco] PATH fallback also failed: %v", err2)
			// Idempotency: choco can exit non-zero when the package is already installed.
			outLower := strings.ToLower(combined)
			alreadyInstalledSignals := []string{
				"already installed",
				"already exists",
				"package already installed",
				"nothing to install",
				"is already installed",
			}
			for _, signal := range alreadyInstalledSignals {
				if strings.Contains(outLower, signal) {
					log.Printf("[choco] Detected already-installed signal '%s' — treating as success", signal)
					return combined, nil
				}
			}
			return combined, fmt.Errorf("choco install failed: %w", err2)
		}
		log.Printf("[choco] PATH fallback succeeded for name=%s", name)
		return installLog + out2, nil
	}
	log.Printf("[choco] Install succeeded for name=%s", name)
	return installLog + out, nil
}

// runMSI downloads and installs a .msi file silently via msiexec.
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
	return runCmd("msiexec", args...)
}

// runEXE downloads and runs a silent .exe installer.
func runEXE(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download exe: %w", err)
	}
	defer cleanup()

	// Default silent flags — overridden by installArgs if provided
	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	return runCmd(path, args...)
}

// runZIP downloads a .zip, extracts it to a temp dir, then runs setup.exe or install.exe.
func runZIP(pkg SoftwarePackage) (string, error) {
	zipPath, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download zip: %w", err)
	}
	defer cleanup()

	// Extract to a sibling temp directory
	extractDir := zipPath + "_extracted"
	if err := os.MkdirAll(extractDir, 0o755); err != nil {
		return "", fmt.Errorf("create extract dir: %w", err)
	}
	defer os.RemoveAll(extractDir)

	if err := extractZip(zipPath, extractDir); err != nil {
		return "", fmt.Errorf("extract zip: %w", err)
	}

	// Look for common installer filenames
	installer := findInstallerInDir(extractDir, []string{"setup.exe", "install.exe", "installer.exe"})
	if installer == "" {
		return "", fmt.Errorf("no installer found in zip (expected setup.exe, install.exe, or installer.exe)")
	}

	args := []string{"/S", "/silent", "/quiet"}
	if pkg.InstallArgs != "" {
		args = strings.Fields(pkg.InstallArgs)
	}
	return runCmd(installer, args...)
}

// runPowerShell downloads and executes a .ps1 script with bypass execution policy.
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
	return runCmd("powershell.exe", args...)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func runCmd(name string, args ...string) (string, error) {
	log.Printf("[runCmd] Executing: %s %v", name, args)
	cmd := exec.Command(name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())
	if err != nil {
		log.Printf("[runCmd] FAILED: %s %v — exitErr=%v", name, args, err)
		log.Printf("[runCmd] stdout: %s", stdout.String())
		log.Printf("[runCmd] stderr: %s", stderr.String())
		return combined, fmt.Errorf("%s exited with error: %w", name, err)
	}
	log.Printf("[runCmd] SUCCESS: %s %v", name, args)
	log.Printf("[runCmd] stdout: %s", stdout.String())
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
		// Guard against zip slip
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
	// Walk subdirs one level deep
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
