package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
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
	log.Printf("[reporter] Sending result — job=%s status=%s payloadBytes=%d url=%s",
		jobID, status, len(body), url)

	resp, err := r.client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[reporter] HTTP error — job=%s status=%s err=%v", jobID, status, err)
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	// Read response body for detailed error logging
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("[reporter] Server rejected result — job=%s status=%s httpStatus=%d responseBody=%s",
			jobID, status, resp.StatusCode, string(respBody))
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	log.Printf("[reporter] %s — job=%s status=%s ok (payloadBytes=%d)",
		time.Now().Format(time.RFC3339), jobID, status, len(body))
	return nil
}
