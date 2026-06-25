//go:build darwin

package installer

import (
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
	case "brew":
		return runBrew(pkg)
	case "script":
		return runShellScript(pkg)
	case "zip":
		return runZIPMac(pkg)
	case "pkg":
		return runPKG(pkg)
	default:
		return "", fmt.Errorf("install method %q is not supported on macOS", pkg.InstallMethod)
	}
}

func runBrew(pkg SoftwarePackage) (string, error) {
	name := pkg.BrewName
	if name == "" {
		name = pkg.Name
	}
	args := []string{"install", name}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("brew", args...)
}

func runShellScript(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download script: %w", err)
	}
	defer cleanup()

	if err := os.Chmod(path, 0o755); err != nil {
		return "", fmt.Errorf("chmod script: %w", err)
	}
	args := []string{path}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("bash", args...)
}

func runZIPMac(pkg SoftwarePackage) (string, error) {
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

	if out, err := runCmd("unzip", "-o", zipPath, "-d", extractDir); err != nil {
		return out, err
	}

	script := findScript(extractDir, []string{"install.sh", "setup.sh"})
	if script == "" {
		return "", fmt.Errorf("no install.sh or setup.sh found in zip")
	}
	os.Chmod(script, 0o755)
	args := []string{script}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("bash", args...)
}

// runPKG installs a macOS .pkg file silently using the installer command.
func runPKG(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download pkg: %w", err)
	}
	defer cleanup()

	args := []string{"-pkg", path, "-target", "/"}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("installer", args...)
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

func downloadFile(url, fileName string) (string, func(), error) {
	if url == "" {
		return "", func() {}, fmt.Errorf("fileUrl is empty")
	}
	resp, err := http.Get(url) // #nosec G107
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

func findScript(dir string, names []string) string {
	for _, name := range names {
		p := filepath.Join(dir, name)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if entry.IsDir() {
			for _, name := range names {
				p := filepath.Join(dir, entry.Name(), name)
				if _, err := os.Stat(p); err == nil {
					return p
				}
			}
		}
	}
	return ""
}
