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
	"github.com/racko-ai/agent/appupdater"
	"github.com/racko-ai/agent/rackoapp"
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
	AgentID         string       `json:"agentId"`
	Status          string       `json:"status"`
	Version         string       `json:"version"`
	RackoAppVersion string       `json:"rackoAppVersion,omitempty"`
	Specs           MachineSpecs `json:"specs"`
}

// heartbeatResponse is the parsed server response to a heartbeat.
type heartbeatResponse struct {
	// UpdateAvailable is set to true when the server has a newer agent version.
	UpdateAvailable bool   `json:"updateAvailable"`
	LatestVersion   string `json:"latestVersion"`
	// Checksum is the expected SHA256 hex string of the new binary.
	Checksum string `json:"checksum"`
	// RackoAppUpdateAvailable is set when the server has a newer racko-app GUI version.
	RackoAppUpdateAvailable bool   `json:"rackoAppUpdateAvailable"`
	RackoAppLatestVersion   string `json:"rackoAppLatestVersion"`
	RackoAppChecksum        string `json:"rackoAppChecksum"`
}

// Start sends a heartbeat to the platform every 30 seconds including machine specs.
// Call this in a separate goroutine: go heartbeat.Start(cfg, agentID, done, cancel).
// cancel is called on 403 to stop all goroutines before self-uninstalling.
func Start(cfg *config.Config, agentID string, done <-chan struct{}, cancel func()) {
	const interval = 30 * time.Second
	client := &http.Client{Timeout: 10 * time.Second}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	log.Printf("[heartbeat] Started — sending every %s (version=%s)", interval, config.Version)

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
		AgentID:         agentID,
		Status:          "online",
		Version:         config.Version,
		RackoAppVersion: rackoapp.InstalledVersion(),
		Specs:           specs,
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
		// then uninstall cleanly.
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
			log.Printf("[heartbeat] Agent update available — current=%s latest=%s — triggering self-update",
				config.Version, hbResp.Data.LatestVersion)
			go updater.Update(cfg, hbResp.Data.Checksum, cancel)
		} else if hbResp.Data.RackoAppUpdateAvailable {
			log.Printf("[heartbeat] Racko App update available — current=%s latest=%s",
				rackoapp.InstalledVersion(), hbResp.Data.RackoAppLatestVersion)
			go appupdater.Update(cfg, hbResp.Data.RackoAppLatestVersion, hbResp.Data.RackoAppChecksum)
		}
	}

	log.Printf("[heartbeat] %s — ok", time.Now().Format(time.RFC3339))
	return nil
}

// selfUninstall stops all agent goroutines then removes the agent from the machine.
func selfUninstall(cancel func()) {
	if runtime.GOOS != "windows" {
		log.Printf("[heartbeat] selfUninstall: skipping on non-Windows OS")
		return
	}

	if cancel != nil {
		cancel()
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
		log.Printf("[heartbeat] selfUninstall: failed to start uninstall script: %v", err)
	}
	log.Printf("[heartbeat] selfUninstall: uninstall script launched, agent exiting")
}
