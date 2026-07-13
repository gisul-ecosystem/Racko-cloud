package executor

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/installer"
	"github.com/racko-ai/agent/poller"
	"github.com/racko-ai/agent/reporter"
)

// installMu serializes all installs — one package at a time.
// Package managers share OS-level locks and bandwidth; running them
// concurrently causes contention, slower downloads, and hangs.
var installMu sync.Mutex

// Executor processes jobs received from the poller.
type Executor struct {
	agentID string
	cfg     *config.Config
	rep     *reporter.Reporter
	client  *http.Client
}

func New(agentID string, cfg *config.Config, r *reporter.Reporter) *Executor {
	return &Executor{
		agentID: agentID,
		cfg:     cfg,
		rep:     r,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// Handle is the JobHandler passed to the poller.
// Jobs run concurrently (one goroutine per job) but installs are serialized
// via installMu so only one package manager runs at a time.
func (e *Executor) Handle(job poller.Job) {
	log.Printf("[executor] Job received id=%s packages=%d", job.ID, len(job.SoftwareIDs))

	if err := e.rep.Report(job.ID, e.agentID, "installing", ""); err != nil {
		log.Printf("[executor] Failed to report 'installing' for job=%s: %v", job.ID, err)
	}

	var combinedLogs string
	jobFailed := false

	for _, swID := range job.SoftwareIDs {
		pkg, err := e.fetchSoftware(swID)
		if err != nil {
			log.Printf("[executor] Failed to fetch software id=%s: %v", swID, err)
			combinedLogs += fmt.Sprintf("[error] Could not fetch software %s: %v\n", swID, err)
			jobFailed = true
			continue
		}

		log.Printf("[executor] Job %s waiting for install slot (package=%s)", job.ID, pkg.Name)
		waitStart := time.Now()

		// Acquire install lock — waits for any other in-progress install to finish.
		installMu.Lock()
		waitElapsed := time.Since(waitStart).Round(time.Millisecond)
		log.Printf("[executor] Job %s acquired install slot after %s (package=%s)", job.ID, waitElapsed, pkg.Name)
		log.Printf("[executor] Installing %s v%s via %s (job=%s)", pkg.Name, pkg.Version, pkg.InstallMethod, job.ID)
		installStart := time.Now()
		logs, err := installer.Install(*pkg)
		installElapsed := time.Since(installStart).Round(time.Millisecond)
		installMu.Unlock()
		log.Printf("[executor] installer.Install returned for %s — elapsed=%s err=%v", pkg.Name, installElapsed, err)

		combinedLogs += truncateLogs(logs, 50*1024) // cap at 50KB per package

		if err != nil {
			log.Printf("[executor] Install failed for %s: %v", pkg.Name, err)
			log.Printf("[executor] Output:\n%s", logs)
			jobFailed = true
			continue
		}

		log.Printf("[executor] %s installed successfully", pkg.Name)
	}

	finalStatus := "success"
	if jobFailed {
		finalStatus = "failed"
	}
	log.Printf("[executor] Job %s complete — reporting %s", job.ID, finalStatus)
	if err := e.rep.Report(job.ID, e.agentID, finalStatus, combinedLogs); err != nil {
		log.Printf("[executor] Failed to report '%s' for job=%s: %v", finalStatus, job.ID, err)
	}
}

// fetchSoftware calls GET /api/v1/agent/software-catalog/:id?agentId=xxx
func (e *Executor) fetchSoftware(softwareID string) (*installer.SoftwarePackage, error) {
	url := fmt.Sprintf("%s/api/v1/agent/software-catalog/%s?agentId=%s",
		e.cfg.PlatformURL, softwareID, e.agentID)

	resp, err := e.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("platform returned status %d", resp.StatusCode)
	}

	var result struct {
		Data struct {
			Software installer.SoftwarePackage `json:"software"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if result.Data.Software.ID == "" {
		return nil, fmt.Errorf("empty software record returned for id %s", softwareID)
	}

	return &result.Data.Software, nil
}

// truncateLogs keeps at most maxBytes of logs, retaining the tail (most recent output).
// Install logs can be very large — MySQL, Docker etc produce MB of output.
// We keep the tail because it contains the final result/error, which is most useful.
func truncateLogs(logs string, maxBytes int) string {
	if len(logs) <= maxBytes {
		return logs
	}
	truncated := logs[len(logs)-maxBytes:]
	return "[...truncated, showing last " + fmt.Sprintf("%d", maxBytes/1024) + "KB...]\n" + truncated
}
