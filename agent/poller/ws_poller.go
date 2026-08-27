package poller

import (
	"bytes"
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
	"github.com/racko-ai/agent/rackoapp"
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
					log.Printf("[ws-poller] Permanent error — stopping reconnection: %v", err)
					return
				}
				log.Printf("[ws-poller] Connection error (will retry in %s): %v", p.backoff.current, err)
				time.Sleep(p.backoff.current)
				p.increaseBackoff()
			} else {
				log.Printf("[ws-poller] Connection closed cleanly — reconnecting immediately")
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

	log.Printf("[ws-poller] Connecting to %s (agentId=%s)", u.String(), p.agentID)

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.Dial(u.String(), nil)
	if err != nil {
		if resp != nil {
			log.Printf("[ws-poller] WebSocket dial failed — HTTP status: %d", resp.StatusCode)
			if resp.StatusCode == 410 {
				return &permanentError{msg: "agent deleted (410)"}
			}
		} else {
			log.Printf("[ws-poller] WebSocket dial failed — no HTTP response (network/DNS error): %v", err)
		}
		return fmt.Errorf("websocket dial: %w", err)
	}
	defer conn.Close()

	log.Printf("[ws-poller] WebSocket connected successfully to %s", u.Host)

	// writeMu serializes all writes — gorilla/websocket requires this.
	var writeMu sync.Mutex

	safeWrite := func(messageType int, data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(messageType, data)
	}

	conn.SetPongHandler(func(appData string) error {
		log.Println("[ws-poller] Pong received")
		conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		return nil
	})

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
			} else if msg.Type == "shared_file_added" || msg.Type == "shared_file_updated" || msg.Type == "shared_file_deleted" {
				log.Printf("[ws-poller] Received %s — notifying racko-app", msg.Type)
				go writeSharedFileNotify(msg.Type)
			} else if msg.Type == "install_racko_app" {
				var installMsg struct {
					AppVersion string `json:"appVersion"`
				}
				if err := json.Unmarshal(msg.Payload, &installMsg); err != nil {
					log.Printf("[ws-poller] Malformed install_racko_app payload: %v", err)
					continue
				}
				log.Printf("[ws-poller] Received install_racko_app — version=%s", installMsg.AppVersion)
				go p.runInstallRackoApp(installMsg.AppVersion, safeWrite)
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
// Also POSTs the result directly to core-api via HTTP for guaranteed delivery even
// if the WebSocket was dropped during the long-running reset script.
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

	scriptURL := p.cfg.PlatformURL + "/api/v1/agent/reset-script"
	log.Printf("[ws-poller] runReset: downloading script from %s", scriptURL)

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Get(scriptURL)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to download reset script: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		p.postResetResult(sessionID, false, errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		errMsg := fmt.Sprintf("Server returned %d when fetching reset script", resp.StatusCode)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		p.postResetResult(sessionID, false, errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	scriptContent, err := io.ReadAll(resp.Body)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to read reset script: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		p.postResetResult(sessionID, false, errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	tmpPath := `C:\Windows\Temp\racko-reset.ps1`
	if err := os.WriteFile(tmpPath, scriptContent, 0644); err != nil {
		errMsg := fmt.Sprintf("Failed to write reset script to temp: %v", err)
		log.Printf("[ws-poller] runReset: %s", errMsg)
		p.postResetResult(sessionID, false, errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}
	defer os.Remove(tmpPath)

	sendEvent("reset_progress", 1, "Running reset script...", false, "")
	log.Printf("[ws-poller] runReset: executing script, sessionId=%s", sessionID)

	cmd := exec.Command("powershell.exe",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", tmpPath,
	)
	out, err := cmd.CombinedOutput()

	if err != nil {
		errMsg := string(out)
		if errMsg == "" {
			errMsg = err.Error()
		}
		if len(errMsg) > 2048 {
			errMsg = errMsg[:2048] + "...(truncated)"
		}
		log.Printf("[ws-poller] runReset: script failed: %v", err)
		p.postResetResult(sessionID, false, errMsg)
		sendEvent("reset_complete", 0, "", false, errMsg)
		return
	}

	log.Printf("[ws-poller] runReset: script completed successfully, sessionId=%s", sessionID)
	p.postResetResult(sessionID, true, "")
	sendEvent("reset_complete", 0, "", true, "")
}

// ─── postResetResult ──────────────────────────────────────────────────────────

// postResetResult POSTs the reset outcome directly to core-api via HTTP, bypassing
// the WebSocket. This guarantees delivery even when the WS connection was dropped
// during the long-running reset script. Retries up to 3 times with backoff.
func (p *WSPoller) postResetResult(sessionID string, success bool, errMsg string) {
	type resetResultPayload struct {
		SessionID string `json:"sessionId"`
		Success   bool   `json:"success"`
		Error     string `json:"error,omitempty"`
	}

	payload := resetResultPayload{SessionID: sessionID, Success: success, Error: errMsg}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[ws-poller] postResetResult: marshal error: %v", err)
		return
	}

	endpoint := p.cfg.PlatformURL + "/api/v1/agent/reset-result"
	client := &http.Client{Timeout: 15 * time.Second}
	delays := []time.Duration{2 * time.Second, 5 * time.Second, 10 * time.Second}

	for attempt := 0; attempt <= 3; attempt++ {
		if attempt > 0 {
			time.Sleep(delays[attempt-1])
			log.Printf("[ws-poller] postResetResult: retry %d for sessionId=%s", attempt, sessionID)
		}

		req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			log.Printf("[ws-poller] postResetResult: build request error: %v", err)
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Agent-ID", p.agentID)

		r, err := client.Do(req)
		if err != nil {
			log.Printf("[ws-poller] postResetResult: http error (attempt %d): %v", attempt+1, err)
			continue
		}
		r.Body.Close()

		if r.StatusCode == http.StatusOK {
			log.Printf("[ws-poller] postResetResult: delivered, sessionId=%s success=%v", sessionID, success)
			return
		}
		log.Printf("[ws-poller] postResetResult: server returned %d (attempt %d), sessionId=%s", r.StatusCode, attempt+1, sessionID)
	}

	log.Printf("[ws-poller] postResetResult: all attempts failed for sessionId=%s", sessionID)
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

func (p *WSPoller) runUninstall() {
	if p.cancel != nil {
		p.cancel()
	}
	time.Sleep(500 * time.Millisecond)

	script := `
if (Test-Path "C:\ProgramData\racko-agent\unins000.exe") {
    & "C:\ProgramData\racko-agent\unins000.exe" /SILENT /SUPPRESSMSGBOXES /NORESTART
    Start-Sleep -Seconds 3
}
sc.exe stop RackoAgent 2>$null
sc.exe delete RackoAgent 2>$null
Stop-Process -Name "racko-app" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:PUBLIC\Desktop\Racko Shared Files.lnk" -Force -ErrorAction SilentlyContinue
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

// ─── Shared File Notification ─────────────────────────────────────────────────

// writeSharedFileNotify writes a trigger file so racko-app reloads the inbox instantly.
func writeSharedFileNotify(eventType string) {
	const notifyPath = `C:\ProgramData\racko-agent\racko-notify.json`

	ts := time.Now().UnixMilli()
	content := fmt.Sprintf(`{"event":%q,"ts":%d}`, eventType, ts)
	if err := os.WriteFile(notifyPath, []byte(content), 0o644); err != nil {
		log.Printf("[ws-poller] writeSharedFileNotify: failed to write trigger: %v", err)
		return
	}
	log.Printf("[ws-poller] writeSharedFileNotify: notified racko-app of %s", eventType)
}

// ─── Install Racko App ────────────────────────────────────────────────────────

// runInstallRackoApp runs the Go-native racko-app installer and reports the result
// back to the server via WebSocket as an install_racko_app_result message.
// The Go installer uses net/http with a 10-minute timeout — no PowerShell, no hang risk.
func (p *WSPoller) runInstallRackoApp(appVersion string, safeWrite func(int, []byte) error) {
	log.Printf("[ws-poller] runInstallRackoApp: starting install, version=%s", appVersion)

	err := rackoapp.Install(p.cfg, appVersion)

	success := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
		log.Printf("[ws-poller] runInstallRackoApp: failed: %v", err)
	} else {
		log.Printf("[ws-poller] runInstallRackoApp: completed successfully")
	}

	result := map[string]interface{}{
		"success": success,
		"error":   errMsg,
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"type":    "install_racko_app_result",
		"payload": result,
	})

	if err := safeWrite(websocket.TextMessage, payload); err != nil {
		log.Printf("[ws-poller] runInstallRackoApp: failed to send result: %v", err)
	}
}
