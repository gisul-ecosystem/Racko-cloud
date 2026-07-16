package heartbeat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
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
	specs := collectSpecs()
	log.Printf("[heartbeat] Specs collected — hostname=%s osVersion=%s cpuCores=%d ramGb=%.1f diskGb=%.1f",
		specs.Hostname, specs.OSVersion, specs.CPUCores, specs.RAMGB, specs.DiskGB)

	payload := heartbeatRequest{
		AgentID: agentID,
		Status:  "online",
		Specs:   specs,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	log.Printf("[heartbeat] Sending payload: %s", string(body))

	resp, err := client.Post(platformURL+"/api/v1/agent/heartbeat", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden {
		// 403 means the machine was deleted from the platform — uninstall and exit cleanly
		log.Printf("[heartbeat] Received 403 — machine deleted from platform. Uninstalling agent...")
		selfUninstall()
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	log.Printf("[heartbeat] %s — ok", time.Now().Format(time.RFC3339))
	return nil
}

// selfUninstall cleanly removes the agent from the machine.
// Uses the Inno Setup uninstaller which handles service stop, registry cleanup,
// Control Panel removal, and file deletion.
func selfUninstall() {
	if runtime.GOOS != "windows" {
		log.Printf("[heartbeat] selfUninstall: skipping on non-Windows OS")
		return
	}

	script := `
& "C:\ProgramData\racko-agent\unins000.exe" /SILENT /SUPPRESSMSGBOXES /NORESTART
Start-Sleep -Seconds 3
Remove-Item "C:\ProgramData\racko-agent" -Recurse -Force -ErrorAction SilentlyContinue
sc.exe delete RackoAgent 2>$null
`
	cmd := exec.Command("powershell.exe", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	if err := cmd.Start(); err != nil {
		log.Printf("[heartbeat] selfUninstall: failed to start uninstall script: %v", err)
	}
	// Don't wait — the script will stop and delete us, so we just exit
	log.Printf("[heartbeat] selfUninstall: uninstall script launched, agent exiting")
}
