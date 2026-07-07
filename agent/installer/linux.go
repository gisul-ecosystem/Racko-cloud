//go:build linux

package installer

import (
	"bufio"
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
	case "apt":
		return runApt(pkg)
	case "script":
		return runShellScript(pkg)
	case "zip":
		return runZIPLinux(pkg)
	default:
		// For winget/choco/msi/exe — not supported on Linux
		return "", fmt.Errorf("install method %q is not supported on Linux", pkg.InstallMethod)
	}
}

func runApt(pkg SoftwarePackage) (string, error) {
	name := pkg.AptName
	if name == "" {
		name = pkg.Name
	}
	pm, err := detectPackageManager()
	if err != nil {
		return "", err
	}

	// Update package lists before installing
	updateOut, err := runCmd(pm, "update", "-y")
	if err != nil {
		// Non-fatal — log and continue, install may still work
		updateOut += "\n[warn] apt update failed, continuing anyway\n"
	}

	args := []string{"install", "-y", name}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	installOut, err := runCmd(pm, args...)
	return updateOut + installOut, err
}

func runShellScript(pkg SoftwarePackage) (string, error) {
	path, cleanup, err := downloadFile(pkg.FileURL, pkg.FileName)
	if err != nil {
		return "", fmt.Errorf("download script: %w", err)
	}
	defer cleanup()

	// Make executable
	if err := os.Chmod(path, 0o755); err != nil {
		return "", fmt.Errorf("chmod script: %w", err)
	}

	args := []string{path}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("bash", args...)
}

func runZIPLinux(pkg SoftwarePackage) (string, error) {
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

	// Look for install.sh or setup.sh
	installer := findScript(extractDir, []string{"install.sh", "setup.sh"})
	if installer == "" {
		return "", fmt.Errorf("no install.sh or setup.sh found in zip")
	}

	os.Chmod(installer, 0o755)
	args := []string{installer}
	if pkg.InstallArgs != "" {
		args = append(args, strings.Fields(pkg.InstallArgs)...)
	}
	return runCmd("bash", args...)
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

func detectPackageManager() (string, error) {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return "", err
	}
	defer f.Close()

	vals := map[string]string{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			vals[parts[0]] = strings.Trim(parts[1], `"`)
		}
	}

	id := strings.ToLower(vals["ID"] + " " + vals["ID_LIKE"])
	switch {
	case strings.Contains(id, "debian") || strings.Contains(id, "ubuntu"):
		return "apt-get", nil
	case strings.Contains(id, "fedora"):
		return "dnf", nil
	case strings.Contains(id, "rhel") || strings.Contains(id, "centos"):
		return "yum", nil
	}
	for _, pm := range []string{"apt-get", "dnf", "yum"} {
		if _, err := exec.LookPath(pm); err == nil {
			return pm, nil
		}
	}
	return "", fmt.Errorf("no supported package manager found")
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
