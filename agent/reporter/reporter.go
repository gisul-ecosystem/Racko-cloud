package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/racko-ai/agent/config"
)

type jobResultRequest struct {
	AgentID string `json:"agentId"`
	Status  string `json:"status"`
	Logs    string `json:"logs"`
}

// Reporter sends job results back to the platform.
type Reporter struct {
	cfg    *config.Config
	client *http.Client
}

func New(cfg *config.Config) *Reporter {
	return &Reporter{
		cfg:    cfg,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Report POSTs the job result to the platform and logs the outcome.
func (r *Reporter) Report(jobID, agentID, status, logs string) error {
	payload := jobResultRequest{
		AgentID: agentID,
		Status:  status,
		Logs:    logs,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/agent/jobs/%s/result", r.cfg.PlatformURL, jobID)
	resp, err := r.client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	log.Printf("[reporter] %s — job=%s status=%s", time.Now().Format(time.RFC3339), jobID, status)
	return nil
}
