package poller

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/racko-ai/agent/config"
)

// Job represents a pending install job returned by the platform.
type Job struct {
	ID          string   `json:"_id"`
	MachineID   string   `json:"machineId"`
	SoftwareIDs []string `json:"softwareIds"`
	Status      string   `json:"status"`
	Logs        string   `json:"logs"`
	Attempts    int      `json:"attempts"`
}

type jobResponse struct {
	Data struct {
		Job *Job `json:"job"`
	} `json:"data"`
}

// JobHandler is called when a pending job is received from the platform.
type JobHandler func(job Job)

// Poller polls the platform for pending jobs at a fixed interval.
//
// TODO: Swap point — replace HTTP polling with a WebSocket connection.
// The JobHandler interface is intentionally kept narrow so the transport
// layer can be swapped (e.g. gorilla/websocket) without changing the executor.
type Poller struct {
	cfg     *config.Config
	agentID string
	handler JobHandler
	client  *http.Client
}

// New creates a Poller. The provided handler is called synchronously for each job.
func New(cfg *config.Config, agentID string, handler JobHandler) *Poller {
	return &Poller{
		cfg:     cfg,
		agentID: agentID,
		handler: handler,
		client:  &http.Client{Timeout: 10 * time.Second},
	}
}

// Start begins the polling loop. It blocks until the provided done channel is closed.
func (p *Poller) Start(done <-chan struct{}) {
	const interval = 5 * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[poller] Started polling every %s for agentId=%s", interval, p.agentID)

	for {
		select {
		case <-done:
			log.Println("[poller] Stopping.")
			return
		case <-ticker.C:
			job, err := p.fetchPendingJob()
			if err != nil {
				log.Printf("[poller] Error fetching job: %v", err)
				continue
			}
			if job == nil {
				// No pending job — keep polling.
				continue
			}
			log.Printf("[poller] Received job id=%s", job.ID)
			p.handler(*job)
		}
	}
}

func (p *Poller) fetchPendingJob() (*Job, error) {
	// TODO: Swap point — replace this GET request with a WebSocket message receive.
	url := fmt.Sprintf("%s/api/v1/agent/jobs/%s", p.cfg.PlatformURL, p.agentID)
	resp, err := p.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result jobResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	return result.Data.Job, nil
}
