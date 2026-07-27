package poller

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/tracker"
)

// Job represents a pending install job received from the platform.
type Job struct {
	ID          string   `json:"_id"`
	MachineID   string   `json:"machineId"`
	SoftwareIDs []string `json:"softwareIds"`
	Status      string   `json:"status"`
	Logs        string   `json:"logs"`
	Attempts    int      `json:"attempts"`
}

// JobHandler is called when a job is received from the platform.
type JobHandler func(job Job)

// WSPoller connects to the platform via WebSocket and receives jobs in real-time.
// It implements infinite reconnection with exponential backoff.
type WSPoller struct {
	cfg            *config.Config
	agentID        string
	handler        JobHandler
	backoff        *backoffState
	cancel         func() // called on uninstall to stop all goroutines cleanly
	stopWatcher    func() // called before reset to pause filesystem tracking
	restartWatcher func() // called after reset to resume filesystem tracking
}

type backoffState struct {
	current time.Duration
	max     time.Duration
}

// NewWS creates a WebSocket poller.
func NewWS(cfg *config.Config, agentID string, handler JobHandler, cancel func(), stopWatcher func(), restartWatcher func()) *WSPoller {
	return &WSPoller{
		cfg:            cfg,
		agentID:        agentID,
		handler:        handler,
		cancel:         cancel,
		stopWatcher:    stopWatcher,
		restartWatcher: restartWatcher,
		backoff: &backoffState{
			current: 5 * time.Second,
			max:     60 * time.Second,
		},
	}
}

// Start connects to the WebSocket endpoint and listens for jobs.
// Reconnects automatically with exponential backoff on disconnect.
// Blocks until done is closed.
func (p *WSPoller) Start(done <-chan struct{}) {
	log.Printf("[ws-poller] Starting WebSocket poller for agentId=%s", p.agentID)

	for {
		select {
		case <-done:
			log.Println("[ws-poller] Stopping.")
			return
		default:
			if err := p.connect(done); err != nil {
				if isPermanentError(err) {
					log.Printf("[ws-poller] Permanent error: %v — stopping reconnection attempts", err)
					return
				}
				log.Printf("[ws-poller] Connection error: %v — retrying in %s", err, p.backoff.current)
				time.Sleep(p.backoff.current)
				p.increaseBackoff()
			} else {
				p.resetBackoff()
			}
		}
	}
}

func (p *WSPoller) connect(done <-chan struct{}) error {
	u, err := url.Parse(p.cfg.PlatformURL)
	if err != nil {
		return fmt.Errorf("parse platform URL: %w", err)
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	default:
		u.Scheme = "ws"
	}
	u.Path = "/api/v1/agent/connect"
	q := u.Query()
	q.Set("agentId", p.agentID)
	u.RawQuery = q.Encode()

	log.Printf("[ws-poller] Connecting to %s", u.String())

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.Dial(u.String(), nil)
	if err != nil {
		if resp != nil && resp.StatusCode == 410 {
			return &permanentError{msg: "agent deleted (410)"}
		}
		return fmt.Errorf("websocket dial: %w", err)
	}
	defer conn.Close()

	log.Println("[ws-poller] Connected")

	// writeMu serializes all writes — gorilla/websocket requires this.
	var writeMu sync.Mutex

	safeWrite := func(messageType int, data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(messageType, data)
	}

	// Pong handler: called from the read goroutine — safe to reset deadline,
	// but sends pong via safeWrite to avoid concurrent write conflict.
	conn.SetPongHandler(func(appData string) error {
		log.Println("[ws-poller] Pong received")
		conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		return nil
	})

	// Server pings arrive as ping frames — gorilla auto-sends pong by default,
	// but we override to use our write mutex.
	conn.SetPingHandler(func(appData string) error {
		log.Println("[ws-poller] Ping received from server, sending pong")
		conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		return safeWrite(websocket.PongMessage, []byte(appData))
	})

	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Minute)); err != nil {
		return fmt.Errorf("set read deadline: %w", err)
	}

	// Active ping ticker — agent pings the server every 30s.
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// Read loop runs in a goroutine — only one reader, only one writer at a time.
	errChan := make(chan error, 1)
	go func() {
		for {
			var msg struct {
				Type    string          `json:"type"`
				Payload json.RawMessage `json:"payload"`
			}
			if err := conn.ReadJSON(&msg); err != nil {
				errChan <- err
				return
			}
			if msg.Type == "job" {
				var job Job
				if err := json.Unmarshal(msg.Payload, &job); err != nil {
					log.Printf("[ws-poller] Malformed job payload: %v", err)
					continue
				}
				log.Printf("[ws-poller] Received job id=%s", job.ID)
				go p.handler(job)
			} else if msg.Type == "uninstall" {
				log.Printf("[ws-poller] Received uninstall command — running cleanup script")
				go p.runUninstall()
			} else if msg.Type == "reset" {
				var resetMsg struct {
					SessionID string `json:"sessionId"`
				}
				if err := json.Unmarshal(msg.Payload, &resetMsg); err != nil {
					log.Printf("[ws-poller] Malformed reset payload: %v", err)
					continue
				}
				log.Printf("[ws-poller] Received reset command — sessionId=%s", resetMsg.SessionID)
				go p.runReset(resetMsg.SessionID, safeWrite)
			} else if msg.Type == "exec" {
				var execMsg struct {
					CommandID string `json:"commandId"`
					Command   string `json:"command"`
				}
				if err := json.Unmarshal(msg.Payload, &execMsg); err != nil {
					log.Printf("[ws-poller] Malformed exec payload: %v", err)
					continue
				}
				log.Printf("[ws-poller] Received exec commandId=%s", execMsg.CommandID)
				go p.runExec(execMsg.CommandID, execMsg.Command, safeWrite)
			} else if msg.Type == "clone_replay" {
				var cloneMsg struct {
					SessionID       string `json:"sessionId"`
					SourceMachineID string `json:"sourceMachineId"`
				}
				if err := json.Unmarshal(msg.Payload, &cloneMsg); err != nil {
					log.Printf("[ws-poller] Malformed clone_replay payload: %v", err)
					continue
				}
				log.Printf("[ws-poller] Received clone_replay sessionId=%s sourceMachineId=%s",
					cloneMsg.SessionID, cloneMsg.SourceMachineID)
				go p.runCloneReplay(cloneMsg.SessionID, cloneMsg.SourceMachineID, safeWrite)
			}
		}
	}()

	for {
		select {
		case err := <-errChan:
			closeErr := parseCloseError(err)
			if closeErr != nil && closeErr.Code == 4010 {
				return &permanentError{msg: fmt.Sprintf("agent deleted (close code %d)", closeErr.Code)}
			}
			return fmt.Errorf("read error: %w", err)
		case <-pingTicker.C:
			if err := safeWrite(websocket.PingMessage, nil); err != nil {
				return fmt.Errorf("ping failed: %w", err)
			}
			log.Println("[ws-poller] Ping sent")
		case <-done:
			log.Println("[ws-poller] Closing connection (done signal)")
			return safeWrite(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		}
	}
}

func (p *WSPoller) increaseBackoff() {
	p.backoff.current *= 2
	if p.backoff.current > p.backoff.max {
		p.backoff.current = p.backoff.max
	}
}

func (p *WSPoller) resetBackoff() {
	p.backoff.current = 5 * time.Second
}

// ─── Exec ─────────────────────────────────────────────────────────────────────

// runExec runs a PowerShell command and sends the result back over WebSocket.
// Uses cmd.Output() (blocking) — runs in its own goroutine so it doesn't block the read loop.
func (p *WSPoller) runExec(commandID, command string, safeWrite func(int, []byte) error) {
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command)
	out, err := cmd.CombinedOutput()

	output := string(out)
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
			if output == "" {
				output = err.Error()
			}
		}
	}

	result := map[string]interface{}{
		"commandId": commandID,
		"output":    output,
		"exitCode":  exitCode,
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"type":    "exec_result",
		"payload": result,
	})

	if err := safeWrite(websocket.TextMessage, payload); err != nil {
		log.Printf("[ws-poller] runExec: failed to send result for commandId=%s: %v", commandID, err)
	} else {
		log.Printf("[ws-poller] runExec: sent result commandId=%s exitCode=%d", commandID, exitCode)
	}
}

// ─── Reset ────────────────────────────────────────────────────────────────────

// runReset downloads the reset PowerShell script from the platform server,
// saves it to a temp file, runs it with -File (required by the script's safety guard),
// then deletes the temp file. Sends reset_progress on start and reset_complete when done.
func (p *WSPoller) runReset(sessionID string, safeWrite func(int, []byte) error) {
	sendEvent := func(eventType string, phase int, message string, success bool, errMsg string) {
		payload := map[string]interface{}{
			"sessionId": sessionID,
			"machineId": p.agentID,
		}
		if eventType == "reset_progress" {
			payload["phase"] = phase
			payload["message"] = message
		} else {
			payload["success"] = success
			if errMsg != "" {
				payload["error"] = errMsg
			}
		}
		msg, _ := json.Marshal(map[string]interface{}{
			"type":    eventType,
			"payload": payload,
		})
		if err := safeWrite(websocket.TextMessage, msg); err != nil {
			log.Printf("[ws-poller] runReset: failed to send %s event: %v", eventType, err)
		}
	}

	sendEvent("reset_progress", 0, "Downloading reset script from server...", false, "")

	// ── Step 1: Download the reset script from the platform server ────────────
	scriptURL := p.cfg.PlatformURL + "/api/v1/agent/reset-script"
	log.Printf("[ws-poller] runReset: downloading script from %s", scriptURL)

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Get(scriptURL)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to download reset script: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		errMsg := fmt.Sprintf("Server returned %d when fetching reset script", resp.StatusCode)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	scriptContent, err := io.ReadAll(resp.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to read reset script: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	// ── Step 2: Write to temp file ─────────────────────────────────────────────
	tmpPath := `C:\Windows\Temp\racko-reset.ps1`
	if err := os.WriteFile(tmpPath, scriptContent, 0644); err != nil {
		errMsg := fmt.Sprintf("Failed to write reset script to temp: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}
	defer os.Remove(tmpPath) // always clean up temp file

	sendEvent("reset_progress", 1, "Running reset script...", false, "")
	log.Printf("[ws-poller] runReset: executing script, sessionId=%s", sessionID)

	// Stop the watcher BEFORE running the reset script.
	// Without this, the watcher detects every file the reset script deletes
	// and records them as file_delete activity events — polluting the change log
	// with 300+ fake deletions that represent the reset, not user changes.
	if p.stopWatcher != nil {
		p.stopWatcher()
	}

	// ── Step 3: Run with -File flag (required by the script's safety guard) ───
	cmd := exec.Command("powershell.exe",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", tmpPath,
	)
	out, err := cmd.CombinedOutput()

	// Restart the watcher AFTER reset completes — whether success or failure.
	// The watcher will now track changes from the clean post-reset state.
	if p.restartWatcher != nil {
		p.restartWatcher()
	}

	if err != nil {
		errMsg := string(out)
		if errMsg == "" {
			errMsg = err.Error()
		}
		// Trim to 2KB to avoid oversized WS messages
		if len(errMsg) > 2048 {
			errMsg = errMsg[:2048] + "...(truncated)"
		}
		log.Printf("[ws-poller] runReset: script failed: %v", err)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	log.Printf("[ws-poller] runReset: script completed successfully, sessionId=%s", sessionID)
	sendEvent("reset_complete", 0, "", true, "")
}

// ─── Clone Replay ─────────────────────────────────────────────────────────────

// runCloneReplay fetches the source VM's activity log and replays it onto this VM.
// Sends clone_progress events during execution and clone_complete when done.
func (p *WSPoller) runCloneReplay(sessionID, sourceMachineID string, safeWrite func(int, []byte) error) {
	sendEvent := func(eventType string, phase int, message string, success bool, errMsg string) {
		payload := map[string]interface{}{
			"sessionId": sessionID,
			"machineId": p.agentID,
		}
		if eventType == "clone_progress" {
			payload["phase"] = phase
			payload["message"] = message
		} else {
			payload["success"] = success
			if errMsg != "" {
				payload["error"] = errMsg
			}
		}
		msg, _ := json.Marshal(map[string]interface{}{
			"type":    eventType,
			"payload": payload,
		})
		if err := safeWrite(websocket.TextMessage, msg); err != nil {
			log.Printf("[ws-poller] runCloneReplay: failed to send %s: %v", eventType, err)
		}
	}

	rep := tracker.NewReplayer(p.agentID, p.cfg, sendEvent)
	rep.Run(sessionID, sourceMachineID)
}

// ─── Uninstall ────────────────────────────────────────────────────────────────
// launches the cleanup script. Using cancel() ensures heartbeat stops
// immediately so it cannot re-launch selfUninstall on the next tick.
func (p *WSPoller) runUninstall() {
	// Cancel the shared done channel — stops heartbeat and all other goroutines
	if p.cancel != nil {
		p.cancel()
	}
	// Small delay to let goroutines observe the cancel before the binary is deleted
	time.Sleep(500 * time.Millisecond)

	script := `
if (Test-Path "C:\ProgramData\racko-agent\unins000.exe") {
    & "C:\ProgramData\racko-agent\unins000.exe" /SILENT /SUPPRESSMSGBOXES /NORESTART
    Start-Sleep -Seconds 3
}
sc.exe stop RackoAgent 2>$null
sc.exe delete RackoAgent 2>$null
Remove-Item "C:\ProgramData\racko-agent" -Recurse -Force -ErrorAction SilentlyContinue
`
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	if err := cmd.Start(); err != nil {
		log.Printf("[ws-poller] runUninstall: failed to start cleanup script: %v", err)
		return
	}
	log.Printf("[ws-poller] runUninstall: cleanup script launched, agent exiting")
}

// ─── Error helpers ────────────────────────────────────────────────────────────

type permanentError struct {
	msg string
}

func (e *permanentError) Error() string { return e.msg }

func isPermanentError(err error) bool {
	_, ok := err.(*permanentError)
	return ok
}

func parseCloseError(err error) *websocket.CloseError {
	if closeErr, ok := err.(*websocket.CloseError); ok {
		return closeErr
	}
	return nil
}
