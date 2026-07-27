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

// Report POSTs the job result to the platform with retry on transient server errors.
// Retries up to 3 times with exponential backoff on 429/502/503/504.
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

	const maxAttempts = 3
	delays := []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second}

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		resp, err := r.client.Post(url, "application/json", bytes.NewReader(body))
		if err != nil {
			if attempt < maxAttempts {
				log.Printf("[reporter] HTTP error (attempt %d/%d) — job=%s err=%v — retrying in %s",
					attempt, maxAttempts, jobID, err, delays[attempt-1])
				time.Sleep(delays[attempt-1])
				continue
			}
			log.Printf("[reporter] HTTP error — job=%s status=%s err=%v", jobID, status, err)
			return fmt.Errorf("http post: %w", err)
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			log.Printf("[reporter] %s — job=%s status=%s ok (payloadBytes=%d)",
				time.Now().Format(time.RFC3339), jobID, status, len(body))
			return nil
		}

		// Retry on transient server errors
		isRetryable := resp.StatusCode == 429 ||
			resp.StatusCode == 502 ||
			resp.StatusCode == 503 ||
			resp.StatusCode == 504

		if isRetryable && attempt < maxAttempts {
			log.Printf("[reporter] Server returned %d (attempt %d/%d) — job=%s — retrying in %s",
				resp.StatusCode, attempt, maxAttempts, jobID, delays[attempt-1])
			time.Sleep(delays[attempt-1])
			continue
		}

		log.Printf("[reporter] Server rejected result — job=%s status=%s httpStatus=%d responseBody=%s",
			jobID, status, resp.StatusCode, string(respBody))
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	return fmt.Errorf("all %d report attempts failed for job=%s", maxAttempts, jobID)
}
