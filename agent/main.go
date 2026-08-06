package main

import (
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/executor"
	"github.com/racko-ai/agent/heartbeat"
	"github.com/racko-ai/agent/install"
	"github.com/racko-ai/agent/poller"
	"github.com/racko-ai/agent/register"
	"github.com/racko-ai/agent/reporter"
	"github.com/racko-ai/agent/store"
	"github.com/racko-ai/agent/tracker"
	"github.com/racko-ai/agent/winsvc"
)

// setupFileLogging redirects all log output to a file alongside the binary.
// Falls back to stderr if the file cannot be opened.
func setupFileLogging() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	logPath := filepath.Join(filepath.Dir(exe), "agent.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	// Write to both file and stderr so interactive runs still show output
	mw := io.MultiWriter(f, os.Stderr)
	log.SetOutput(mw)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.Printf("[main] Log file: %s", logPath)
	log.Printf("[main] Agent starting at %s", time.Now().Format(time.RFC3339))
}

func main() {
	setupFileLogging()

	// ── 1. Load config ────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[main] Failed to load config: %v", err)
	}
	log.Printf("[main] Config loaded — PlatformURL=%s", cfg.PlatformURL)

	// ── 2. --install flag: explicit install mode (Linux/macOS CLI) ───────────
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
		log.Println("[main] Running as Windows service")
		if err := winsvc.Run(func(done <-chan struct{}) {
			runAgent(cfg, done)
		}); err != nil {
			log.Fatalf("[main] Service run failed: %v", err)
		}
		return
	}

	// ── 4. Interactive ────────────────────────────────────────────────────────
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

	agentID, err := store.ReadAgentID()
	if err != nil {
		log.Fatalf("[agent] Failed to read stored agentId: %v", err)
	}

	if agentID == "" {
		log.Println("[agent] No agentId — registering with platform…")
		agentID, err = register.Run(cfg)
		if err != nil {
			log.Fatalf("[agent] Registration failed: %v", err)
		}
		log.Printf("[agent] Registered with agentId=%s", agentID)

		// First registration — capture baseline snapshot now.
		// Baseline is captured regardless of tracking state so it is ready
		// the moment the admin enables tracking. The watcher itself won't
		// start until tracking is enabled via heartbeat or WS command.
		log.Println("[agent] First run — capturing baseline snapshot...")
		if err := tracker.CaptureAndUpload(agentID, cfg); err != nil {
			log.Printf("[agent] WARNING: baseline capture failed: %v (continuing)", err)
		}
	} else {
		log.Printf("[agent] Using existing agentId=%s", agentID)
	}

	log.Printf("[agent] Starting heartbeat and WebSocket poller for agentId=%s", agentID)

	// cancelDone wraps the external done channel with a cancellable layer.
	// This allows the WS poller to cancel all goroutines (including heartbeat)
	// immediately when an uninstall command is received — without waiting for
	// the next heartbeat tick.
	cancelDone := make(chan struct{})
	cancel := func() {
		select {
		case <-cancelDone:
			// already closed
		default:
			close(cancelDone)
		}
	}
	// Bridge: if the external done fires, also cancel our internal channel
	go func() {
		select {
		case <-done:
			cancel()
		case <-cancelDone:
		}
	}()

	// NOTE: watcher does NOT start here. It starts only when tracking is enabled
	// by the admin via the platform. The heartbeat and WS tracking_update command
	// control whether the watcher runs. watcherDone is nil until tracking is enabled.
	var watcherDone chan struct{}

	// stopWatcher stops the current watcher if it is running.
	stopWatcher := func() {
		if watcherDone == nil {
			return // already stopped
		}
		select {
		case <-watcherDone:
			// already closed
		default:
			close(watcherDone)
		}
		watcherDone = nil
		log.Println("[agent] Watcher stopped")
	}

	restartWatcher := func() {
		// Stop any existing watcher first
		stopWatcher()
		watcherDone = make(chan struct{})
		baseline2, _ := tracker.LoadLocal()
		wtr2 := tracker.NewWatcher(agentID, cfg, baseline2)
		go wtr2.Start(watcherDone)
		log.Println("[agent] Watcher started")
	}

	// heartbeat.Start must come after stopWatcher/restartWatcher are defined
	// so the tracking callback can reference them.
	go heartbeat.Start(cfg, agentID, cancelDone, cancel, func(enabled bool) {
		if enabled {
			log.Println("[agent] Heartbeat: tracking enabled by server — starting watcher")
			restartWatcher()
		} else {
			log.Println("[agent] Heartbeat: tracking disabled by server — stopping watcher")
			stopWatcher()
		}
	})

	rep := reporter.New(cfg)
	exec := executor.New(agentID, cfg, rep)
	p := poller.NewWS(cfg, agentID, exec.Handle, cancel, stopWatcher, restartWatcher, func(enabled bool) {
		if enabled {
			log.Println("[agent] WS: tracking enabled by server — starting watcher")
			restartWatcher()
		} else {
			log.Println("[agent] WS: tracking disabled by server — stopping watcher")
			stopWatcher()
		}
	})
	p.Start(cancelDone)

	log.Println("[agent] Stopped.")
}
