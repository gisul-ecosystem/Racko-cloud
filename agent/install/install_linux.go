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

// ShouldSelfInstall returns true when NOT running as a systemd service.
// systemd sets INVOCATION_ID to a real UUID when launching a unit — we use
// that to detect "we are already the service, just run the agent loop".
func ShouldSelfInstall() bool {
	return os.Getenv("INVOCATION_ID") == ""
}

// Install is called by the --install flag path in main.go.
// It copies the binary, writes config.json, installs the systemd unit,
// and starts the service. Must be run as root (sudo).
func Install(cfg *config.Config) error {
	if cfg.PlatformURL == "" {
		return fmt.Errorf("PLATFORM_URL is required")
	}
	if cfg.AccountToken == "" && cfg.EnrollmentKey == "" {
		return fmt.Errorf("ACCOUNT_TOKEN or ENROLLMENT_KEY is required")
	}
	return installLinux(cfg)
}

// RunInstallerGUI on Linux/macOS prints usage to stdout — no GUI available.
// This is hit when the user runs the binary without --install and without
// a token already configured (e.g. double-click equivalent on Linux).
func RunInstallerGUI(cfg *config.Config) {
	if cfg.AccountToken == "" && cfg.EnrollmentKey == "" {
		fmt.Println("Racko Agent Installer")
		fmt.Println("")
		fmt.Println("To install, run one of:")
		fmt.Println("  sudo ACCOUNT_TOKEN=<token> PLATFORM_URL=<url> ./racko-agent --install")
		fmt.Println("  sudo ENROLLMENT_KEY=<key>  PLATFORM_URL=<url> ./racko-agent --install")
		fmt.Println("")
		fmt.Println("Or create /etc/racko-agent/config.json first, then run:")
		fmt.Println("  sudo ./racko-agent --install")
		return
	}

	// Token was passed via env but --install was not specified — be helpful.
	fmt.Println("Token detected. Run with --install to install as a service:")
	fmt.Println("  sudo ./racko-agent --install")
}

func installLinux(cfg *config.Config) error {
	installDir := "/etc/racko-agent"
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return fmt.Errorf("create install dir: %w", err)
	}

	// ── Write config.json ────────────────────────────────────────────────────
	cfgData := fmt.Sprintf(
		`{"PLATFORM_URL":%q,"ACCOUNT_TOKEN":%q,"ENROLLMENT_KEY":%q}`,
		cfg.PlatformURL, cfg.AccountToken, cfg.EnrollmentKey,
	)
	if err := os.WriteFile(installDir+"/config.json", []byte(cfgData), 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	log.Printf("[install] Config written to %s/config.json", installDir)

	// ── Copy binary to /usr/local/bin ────────────────────────────────────────
	destExe := "/usr/local/bin/racko-agent"
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	if !strings.EqualFold(exe, destExe) {
		data, err := os.ReadFile(exe)
		if err != nil {
			return fmt.Errorf("read binary: %w", err)
		}
		if err := os.WriteFile(destExe, data, 0o755); err != nil {
			return fmt.Errorf("write binary to %s: %w", destExe, err)
		}
		log.Printf("[install] Binary copied to %s", destExe)
	}

	// ── Write systemd unit ───────────────────────────────────────────────────
	//
	// Key design decisions:
	//   - After=network-online.target: agent needs internet to register/heartbeat.
	//     Requires systemd-networkd-wait-online or NetworkManager-wait-online.
	//   - WorkingDirectory=/etc/racko-agent: config.json is read from cwd.
	//   - Restart=on-failure: don't restart on clean exit (e.g. --uninstall).
	//   - RestartSec=10: back off on repeated crashes.
	//   - NO fake INVOCATION_ID env: systemd sets it automatically when launching
	//     a unit, which is how ShouldSelfInstall() detects it's running as a service.
	//
	unit := `[Unit]
Description=Racko Cloud Agent
Documentation=https://docs.racko.ai/agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/racko-agent
WorkingDirectory=/etc/racko-agent
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=racko-agent

[Install]
WantedBy=multi-user.target
`
	unitPath := "/etc/systemd/system/racko-agent.service"
	if err := os.WriteFile(unitPath, []byte(unit), 0o644); err != nil {
		return fmt.Errorf("write service unit: %w", err)
	}
	log.Printf("[install] systemd unit written to %s", unitPath)

	// ── Reload systemd and start service ────────────────────────────────────
	for _, args := range [][]string{
		{"systemctl", "daemon-reload"},
		{"systemctl", "enable", "racko-agent"},
		{"systemctl", "restart", "racko-agent"},
	} {
		out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
		if err != nil {
			return fmt.Errorf("systemctl %s: %w — %s", args[1], err, string(out))
		}
		log.Printf("[install] systemctl %s: ok", strings.Join(args[1:], " "))
	}

	fmt.Println("")
	fmt.Println("✓ Racko Agent installed and started.")
	fmt.Println("  Check status: sudo systemctl status racko-agent")
	fmt.Println("  Follow logs:  sudo journalctl -u racko-agent -f")
	return nil
}

// ElevateIfNeeded is a no-op on Linux/macOS.
// The user must run with sudo themselves.
func ElevateIfNeeded() {}

// Uninstall removes the systemd service and all agent files.
func Uninstall() error {
	exec.Command("systemctl", "stop", "racko-agent").Run()
	exec.Command("systemctl", "disable", "racko-agent").Run()
	os.Remove("/etc/systemd/system/racko-agent.service")
	exec.Command("systemctl", "daemon-reload").Run()
	os.RemoveAll("/etc/racko-agent")
	os.Remove("/usr/local/bin/racko-agent")
	log.Println("[uninstall] Racko Agent removed.")
	return nil
}
