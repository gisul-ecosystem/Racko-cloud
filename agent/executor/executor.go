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

	for _, swID := range job.SoftwareIDs {
		pkg, err := e.fetchSoftware(swID)
		if err != nil {
			log.Printf("[executor] Failed to fetch software id=%s: %v", swID, err)
			combinedLogs += fmt.Sprintf("[error] Could not fetch software %s: %v\n", swID, err)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] Failed to report 'failed' for job=%s: %v", job.ID, err)
			}
			continue
		}

		log.Printf("[executor] Installing %s v%s via %s (job=%s)", pkg.Name, pkg.Version, pkg.InstallMethod, job.ID)

		// Acquire install lock — waits for any other in-progress install to finish.
		installMu.Lock()
		logs, err := installer.Install(*pkg)
		installMu.Unlock()

		combinedLogs += logs

		if err != nil {
			log.Printf("[executor] Install failed for %s: %v", pkg.Name, err)
			log.Printf("[executor] Output:\n%s", logs)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] Failed to report 'failed' for job=%s: %v", job.ID, err)
			}
			continue
		}

		log.Printf("[executor] %s installed successfully", pkg.Name)
	}

	log.Printf("[executor] Job %s complete — reporting success", job.ID)
	if err := e.rep.Report(job.ID, e.agentID, "success", combinedLogs); err != nil {
		log.Printf("[executor] Failed to report 'success' for job=%s: %v", job.ID, err)
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
