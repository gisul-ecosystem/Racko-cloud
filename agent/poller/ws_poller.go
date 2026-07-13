package poller

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
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
}

type backoffState struct {
	current time.Duration
	max     time.Duration
}

// NewWS creates a WebSocket poller.
func NewWS(cfg *config.Config, agentID string, handler JobHandler) *WSPoller {
	return &WSPoller{
		cfg:     cfg,
		agentID: agentID,
		handler: handler,
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
