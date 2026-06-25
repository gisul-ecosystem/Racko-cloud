//go:build windows

package installer

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func installOnPlatform(pkg SoftwarePackage) (string, error) {
	switch pkg.InstallMethod {
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

// runChoco installs via Chocolatey. Auto-installs Chocolatey if not present.
func runChoco(pkg SoftwarePackage) (string, error) {
	// Auto-install Chocolatey if missing
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
		// Fallback: try choco from PATH
		out2, err2 := runCmd("choco", args...)
		if err2 != nil {
			return installLog + out + out2, fmt.Errorf("choco install failed: %w", err2)
		}
		return installLog + out2, nil
	}
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
	cmd := exec.Command(name, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	combined := fmt.Sprintf("cmd: %s %v\nstdout:\n%s\nstderr:\n%s",
		name, args, stdout.String(), stderr.String())
	if err != nil {
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
