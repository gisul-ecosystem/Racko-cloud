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
	"github.com/racko-ai/agent/updater"
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
	Version string       `json:"version"`
	Specs   MachineSpecs `json:"specs"`
}

// heartbeatResponse is the parsed server response to a heartbeat.
// The server may include update info when a newer agent version is available.
type heartbeatResponse struct {
	// UpdateAvailable is set to true when the server has a newer agent version.
	UpdateAvailable bool   `json:"updateAvailable"`
	// LatestVersion is the version string the agent should update to.
	LatestVersion   string `json:"latestVersion"`
	// Checksum is the expected SHA256 hex string of the new binary.
	// Empty string means the server did not provide one — checksum is skipped.
	Checksum        string `json:"checksum"`
}

// Start sends a heartbeat to the platform every 30 seconds including machine specs.
// Call this in a separate goroutine: go heartbeat.Start(cfg, agentID, done, cancel).
// cancel is called on 403 to stop all goroutines before self-uninstalling.
func Start(cfg *config.Config, agentID string, done <-chan struct{}, cancel func()) {
	const interval = 30 * time.Second
	client := &http.Client{Timeout: 10 * time.Second}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[heartbeat] Started — sending every %s (version=%s) [v3-scm-restart-fix]", interval, config.Version)

	for {
		select {
		case <-done:
			log.Println("[heartbeat] Stopping.")
			return
		case <-ticker.C:
			if err := sendHeartbeat(client, cfg, agentID, cancel); err != nil {
				log.Printf("[heartbeat] Failed: %v", err)
			}
		}
	}
}

func sendHeartbeat(client *http.Client, cfg *config.Config, agentID string, cancel func()) error {
	specs := collectSpecs()
	log.Printf("[heartbeat] Specs collected — hostname=%s osVersion=%s cpuCores=%d ramGb=%.1f diskGb=%.1f",
		specs.Hostname, specs.OSVersion, specs.CPUCores, specs.RAMGB, specs.DiskGB)

	payload := heartbeatRequest{
		AgentID: agentID,
		Status:  "online",
		Version: config.Version,
		Specs:   specs,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	log.Printf("[heartbeat] Sending payload: %s", string(body))

	resp, err := client.Post(cfg.PlatformURL+"/api/v1/agent/heartbeat", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("http post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden {
		// 403 means the machine was deleted from the platform — cancel all goroutines
		// then uninstall cleanly. cancel() stops the heartbeat ticker so this only
		// runs once, not on every subsequent tick.
		log.Printf("[heartbeat] Received 403 — machine deleted from platform. Stopping agent and uninstalling...")
		selfUninstall(cancel)
		return nil
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	// Parse response to check for update availability
	var hbResp struct {
		Data heartbeatResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&hbResp); err == nil {
		if hbResp.Data.UpdateAvailable {
			log.Printf("[heartbeat] Update available — current=%s latest=%s — triggering self-update",
				config.Version, hbResp.Data.LatestVersion)
			// Run update in a goroutine so heartbeat returns cleanly.
			// The updater will cancel goroutines and exit when done.
			go updater.Update(cfg, hbResp.Data.Checksum, cancel)
		}
	}

	log.Printf("[heartbeat] %s — ok", time.Now().Format(time.RFC3339))
	return nil
}

// selfUninstall stops all agent goroutines then removes the agent from the machine.
// cancel() is called first so the heartbeat goroutine stops immediately — preventing
// repeated 403 responses from re-launching the uninstall script on every tick.
func selfUninstall(cancel func()) {
	if runtime.GOOS != "windows" {
		log.Printf("[heartbeat] selfUninstall: skipping on non-Windows OS")
		return
	}

	// Stop all goroutines first
	if cancel != nil {
		cancel()
	}
	// Brief pause to let goroutines observe the cancel
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
		log.Printf("[heartbeat] selfUninstall: failed to start uninstall script: %v", err)
	}
	log.Printf("[heartbeat] selfUninstall: uninstall script launched, agent exiting")
}
