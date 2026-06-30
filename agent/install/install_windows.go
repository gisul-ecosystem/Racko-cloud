//go:build windows

package install

import (
	"github.com/racko-ai/agent/config"
)

// Install on Windows is handled by the Inno Setup GUI (RunInstallerGUI).
// This stub exists so main.go can call install.Install() on all platforms.
func Install(cfg *config.Config) error {
	RunInstallerGUI(cfg)
	return nil
}
