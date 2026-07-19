//go:build darwin

package installer

import (
	"fmt"
	"os"
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
