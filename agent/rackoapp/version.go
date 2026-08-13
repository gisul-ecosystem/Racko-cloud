package rackoapp

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// versionFilePath returns the path where the installed racko-app version is stored.
// Written by the install/update script after each successful deploy.
func versionFilePath() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\racko-agent\racko-app-version.txt`
	}
	return filepath.Join("/etc/racko-agent", "racko-app-version.txt")
}

// InstalledVersion returns the racko-app version on disk, or "" if not installed.
// If the app folder exists but no version file (legacy install), returns "0.0.0"
// so the server triggers a one-time update that writes the version file.
func InstalledVersion() string {
	data, err := os.ReadFile(versionFilePath())
	if err == nil {
		v := strings.TrimSpace(string(data))
		if v != "" {
			return v
		}
	}
	if runtime.GOOS == "windows" {
		if _, err := os.Stat(`C:\ProgramData\racko-agent\racko-app\racko-app.exe`); err == nil {
			return "0.0.0"
		}
	}
	return ""
}

// IsInstalled returns true when the racko-app version file exists (app was deployed).
func IsInstalled() bool {
	_, err := os.Stat(versionFilePath())
	return err == nil
}
