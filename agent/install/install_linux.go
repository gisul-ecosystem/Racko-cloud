//go:build linux || darwin

package install

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/racko-ai/agent/config"
)

// ShouldSelfInstall returns true when not running as a systemd service.
func ShouldSelfInstall() bool {
	return os.Getenv("INVOCATION_ID") == ""
}

// RunInstallerGUI on Linux/macOS prints usage to stdout — no GUI available.
// The token should be passed via ACCOUNT_TOKEN env var or config.json.
func RunInstallerGUI(cfg *config.Config) {
	if cfg.AccountToken == "" && cfg.EnrollmentKey == "" {
		fmt.Println("Racko Agent Installer")
		fmt.Println("Usage: ACCOUNT_TOKEN=<your-token> sudo ./racko-agent")
		fmt.Println("   or: create /etc/racko-agent/config.json with your token, then sudo ./racko-agent")
		return
	}

	if err := installLinux(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "Installation failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Racko Agent installed and running.")
}

func installLinux(cfg *config.Config) error {
	installDir := "/etc/racko-agent"
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return fmt.Errorf("create install dir: %w", err)
	}

	// Write config.json
	cfgData := fmt.Sprintf(
		`{"PLATFORM_URL":%q,"ACCOUNT_TOKEN":%q,"ENROLLMENT_KEY":%q}`,
		cfg.PlatformURL, cfg.AccountToken, cfg.EnrollmentKey,
	)
	if err := os.WriteFile(installDir+"/config.json", []byte(cfgData), 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	// Copy self to /usr/local/bin
	exe, _ := os.Executable()
	destExe := "/usr/local/bin/racko-agent"
	if !strings.EqualFold(exe, destExe) {
		data, err := os.ReadFile(exe)
		if err != nil {
			return fmt.Errorf("read binary: %w", err)
		}
		if err := os.WriteFile(destExe, data, 0o755); err != nil {
			return fmt.Errorf("write binary: %w", err)
		}
		log.Printf("[install] Copied binary to %s", destExe)
	}

	// Install systemd service
	unit := `[Unit]
Description=Racko Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/racko-agent
WorkingDirectory=/etc/racko-agent
Restart=always
RestartSec=10
StandardOutput=journal
Environment=INVOCATION_ID=systemd

[Install]
WantedBy=multi-user.target
`
	if err := os.WriteFile("/etc/systemd/system/racko-agent.service", []byte(unit), 0o644); err != nil {
		return fmt.Errorf("write service unit: %w", err)
	}

	for _, args := range [][]string{
		{"systemctl", "daemon-reload"},
		{"systemctl", "enable", "racko-agent"},
		{"systemctl", "restart", "racko-agent"},
	} {
		if out, err := exec.Command(args[0], args[1:]...).CombinedOutput(); err != nil {
			return fmt.Errorf("systemctl %s: %w — %s", args[1], err, string(out))
		}
	}
	return nil
}

// ElevateIfNeeded is a no-op on Linux/macOS.
func ElevateIfNeeded() {}

// Uninstall removes the systemd service.
func Uninstall() error {
	exec.Command("systemctl", "stop", "racko-agent").Run()
	exec.Command("systemctl", "disable", "racko-agent").Run()
	os.Remove("/etc/systemd/system/racko-agent.service")
	exec.Command("systemctl", "daemon-reload").Run()
	return nil
}
