package poller

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os/exec"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/racko-ai/agent/config"
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
	cfg     *config.Config
	agentID string
	handler JobHandler
	backoff *backoffState
	cancel  func() // called on uninstall to stop all goroutines cleanly
}

type backoffState struct {
	current time.Duration
	max     time.Duration
}

// NewWS creates a WebSocket poller.
func NewWS(cfg *config.Config, agentID string, handler JobHandler, cancel func()) *WSPoller {
	return &WSPoller{
		cfg:     cfg,
		agentID: agentID,
		handler: handler,
		cancel:  cancel,
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

// ─── Uninstall ────────────────────────────────────────────────────────────────

// runUninstall stops all agent goroutines first (heartbeat, poller) then
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
