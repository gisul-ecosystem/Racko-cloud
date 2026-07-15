package heartbeat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/racko-ai/agent/config"
)

type MachineSpecs struct {
	Hostname  string  `json:"hostname"`
	OSVersion string  `json:"osVersion"`
	CPUCores  int     `json:"cpuCores"`
	RAMGB     float64 `json:"ramGb"`
	DiskGB    float64 `json:"diskGb"`
}

type heartbeatRequest struct {
	AgentID string       `json:"agentId"`
	Status  string       `json:"status"`
	Specs   MachineSpecs `json:"specs"`
}

// Start sends a heartbeat to the platform every 30 seconds including machine specs.
// Call this in a separate goroutine: go heartbeat.Start(cfg, agentID, done).
func Start(cfg *config.Config, agentID string, done <-chan struct{}) {
	const interval = 30 * time.Second
	client := &http.Client{Timeout: 10 * time.Second}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[heartbeat] Started — sending every %s", interval)

	for {
		select {
		case <-done:
			log.Println("[heartbeat] Stopping.")
			return
		case <-ticker.C:
			if err := sendHeartbeat(client, cfg.PlatformURL, agentID); err != nil {
				log.Printf("[heartbeat] Failed: %v", err)
			}
		}
	}
}

func sendHeartbeat(client *http.Client, platformURL, agentID string) error {
	payload := heartbeatRequest{
		AgentID: agentID,
		Status:  "online",
		Specs:   collectSpecs(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	resp, err := client.Post(platformURL+"/api/v1/agent/heartbeat", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	log.Printf("[heartbeat] %s — ok", time.Now().Format(time.RFC3339))
	return nil
}
