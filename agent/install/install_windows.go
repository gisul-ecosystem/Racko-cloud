//go:build windows

package install

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/racko-ai/agent/config"
)

// ShouldSelfInstall on Windows returns true only when config.json does NOT
// already exist. If config is present, the agent is already installed and
// should proceed to the agent loop rather than launching the installer GUI.
func ShouldSelfInstall() bool {
	// Check current working directory for config.json (service runs from install dir)
	if _, err := os.Stat("config.json"); err == nil {
		return false // already installed, skip GUI
	}
	// Also check the default install path
	if _, err := os.Stat(`C:\ProgramData\racko-agent\config.json`); err == nil {
		return false // already installed, skip GUI
	}
	return true
}

// Install on Windows is handled by the Inno Setup GUI (RunInstallerGUI).
// This stub exists so main.go can call install.Install() on all platforms.
func Install(cfg *config.Config) error {
	RunInstallerGUI(cfg)
	return nil
}

// RunInstallerGUI on Windows launches the Inno Setup installer that is
// bundled alongside the agent binary (racko-agent-setup.exe).
// If the setup exe is not found it prints a helpful message and exits.
func RunInstallerGUI(cfg *config.Config) {
	// Look for the installer next to the running binary.
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[install] cannot determine executable path: %v\n", err)
		return
	}

	// The installer is expected to be in the same directory as the agent binary.
	dir := exe[:len(exe)-len("racko-agent.exe")]
	setupExe := dir + "racko-agent-setup.exe"

	if _, err := os.Stat(setupExe); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "[install] setup installer not found at %s\n", setupExe)
		return
	}

	cmd := exec.Command(setupExe)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "[install] installer exited with error: %v\n", err)
	}
}

// ElevateIfNeeded is a no-op on Windows — the Inno Setup installer
// already requests elevation via its manifest (PrivilegesRequired=admin).
func ElevateIfNeeded() {}
