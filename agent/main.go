package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/executor"
	"github.com/racko-ai/agent/heartbeat"
	"github.com/racko-ai/agent/install"
	"github.com/racko-ai/agent/poller"
	"github.com/racko-ai/agent/register"
	"github.com/racko-ai/agent/reporter"
	"github.com/racko-ai/agent/store"
	"github.com/racko-ai/agent/winsvc"
)

func main() {
	// ── 1. Load config ────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[main] Failed to load config: %v", err)
	}

	// ── 2. --install flag: explicit install mode (Linux/macOS CLI) ───────────
	//
	// Usage:
	//   sudo ACCOUNT_TOKEN=<token> PLATFORM_URL=<url> ./racko-agent --install
	//   sudo ENROLLMENT_KEY=<key>  PLATFORM_URL=<url> ./racko-agent --install
	//
	// This installs the binary + config and registers a systemd service,
	// then exits. The service then starts the agent on its own.
	if len(os.Args) > 1 && os.Args[1] == "--install" {
		install.ElevateIfNeeded()
		if err := install.Install(cfg); err != nil {
			log.Fatalf("[main] Installation failed: %v", err)
		}
		log.Println("[main] Installation complete. Service started.")
		return
	}

	// ── 3. Dispatch: Windows service vs interactive ───────────────────────────
	if winsvc.IsWindowsService() {
		// Running as a Windows service — use SCM handler (fixes error 1053)
		if err := winsvc.Run(func(done <-chan struct{}) {
			runAgent(cfg, done)
		}); err != nil {
			log.Fatalf("[main] Service run failed: %v", err)
		}
		return
	}

	// ── 4. Interactive (double-clicked on Windows / terminal on Linux) ────────
	//
	// Windows: no --install flag → show Inno Setup GUI so user can paste token.
	// Linux:   no --install flag and not running as systemd service → print help.
	install.ElevateIfNeeded()
	if install.ShouldSelfInstall() {
		install.RunInstallerGUI(cfg)
		return
	}

	// ── 5. Running as a service (systemd set INVOCATION_ID) ──────────────────
	done := make(chan struct{})
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		log.Printf("[main] Signal %s — shutting down…", sig)
		close(done)
	}()

	runAgent(cfg, done)
}

// runAgent contains the core agent logic — shared between service and terminal modes.
func runAgent(cfg *config.Config, done <-chan struct{}) {
	if cfg.PlatformURL == "" || (cfg.AccountToken == "" && cfg.EnrollmentKey == "") {
		log.Fatal("[agent] PLATFORM_URL and either ACCOUNT_TOKEN or ENROLLMENT_KEY must be set.")
	}

	// Check for existing agentId
	agentID, err := store.ReadAgentID()
	if err != nil {
		log.Fatalf("[agent] Failed to read stored agentId: %v", err)
	}

	// Register if first run
	if agentID == "" {
		log.Println("[agent] No agentId — registering with platform…")
		agentID, err = register.Run(cfg)
		if err != nil {
			log.Fatalf("[agent] Registration failed: %v", err)
		}
	} else {
		log.Printf("[agent] Using existing agentId=%s", agentID)
	}

	// Start heartbeat
	go heartbeat.Start(cfg, agentID, done)

	// Start polling loop (blocks until done)
	rep := reporter.New(cfg)
	exec := executor.New(agentID, cfg, rep)
	p := poller.New(cfg, agentID, exec.Handle)
	p.Start(done)

	log.Println("[agent] Stopped.")
}
