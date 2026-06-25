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

	// ── 2. Dispatch: service vs interactive ───────────────────────────────────
	if winsvc.IsWindowsService() {
		// Running as a Windows service — use SCM handler (fixes error 1053)
		if err := winsvc.Run(func(done <-chan struct{}) {
			runAgent(cfg, done)
		}); err != nil {
			log.Fatalf("[main] Service run failed: %v", err)
		}
		return
	}

	// ── 3. Interactive (double-clicked / terminal) ────────────────────────────
	// Inno Setup handles installation. When the user runs the binary directly,
	// show the installer GUI so they can paste their token.
	install.ElevateIfNeeded()

	if install.ShouldSelfInstall() {
		install.RunInstallerGUI(cfg)
		return
	}

	// Terminal mode (e.g. running directly after Inno Setup for debugging)
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
