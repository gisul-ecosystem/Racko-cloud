package executor

import (
	"context"
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
	"github.com/racko-ai/agent/retry"
)

// installMu serializes all package-manager operations across concurrent jobs.
// Package managers (choco, winget, msi) use OS-level file locks — running them
// concurrently causes lock contention, hangs, or silent failures.
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
func (e *Executor) Handle(job poller.Job) {
	log.Printf("[executor] %s — received job id=%s packages=%d",
		time.Now().Format(time.RFC3339), job.ID, len(job.SoftwareIDs))

	// Report installing immediately
	if err := e.rep.Report(job.ID, e.agentID, "installing", ""); err != nil {
		log.Printf("[executor] Failed to report 'installing': %v", err)
	}

	var combinedLogs string

	for _, swID := range job.SoftwareIDs {
		// Fetch full software record from platform so we know the install method,
		// package name, fileUrl etc.
		pkg, err := e.fetchSoftware(swID)
		if err != nil {
			combinedLogs += fmt.Sprintf("[error] Could not fetch software %s: %v\n", swID, err)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] Failed to report: %v", err)
			}
			continue
		}

		log.Printf("[executor] Installing %s v%s via %s", pkg.Name, pkg.Version, pkg.InstallMethod)

		logs, success := retry.Run(
			func() (string, error) {
				// Serialize all installs — package managers use OS-level file locks.
				// Concurrent choco/winget/msi calls cause lock contention and hangs.
				installMu.Lock()
				defer installMu.Unlock()

				// Install with 30-minute timeout
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
				defer cancel()

				resultChan := make(chan struct {
					logs string
					err  error
				}, 1)

				go func() {
					l, e := installer.Install(*pkg)
					resultChan <- struct {
						logs string
						err  error
					}{l, e}
				}()

				select {
				case result := <-resultChan:
					return result.logs, result.err
				case <-ctx.Done():
					return "", fmt.Errorf("install timeout after 30 minutes")
				}
			},
			func(attempt int, logs string) {
				combinedLogs += logs
				status := "retrying"
				if attempt >= 3 {
					status = "failed"
				}
				if err := e.rep.Report(job.ID, e.agentID, status, combinedLogs); err != nil {
					log.Printf("[executor] Failed to report '%s': %v", status, err)
				}
			},
		)

		combinedLogs += logs

		if !success {
			log.Printf("[executor] Job %s failed for %s — continuing with remaining software", job.ID, pkg.Name)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] Failed to report 'failed': %v", err)
			}
			continue
		}

		log.Printf("[executor] %s installed successfully", pkg.Name)
	}

	log.Printf("[executor] Job %s completed", job.ID)
	if err := e.rep.Report(job.ID, e.agentID, "success", combinedLogs); err != nil {
		log.Printf("[executor] Failed to report 'success': %v", err)
	}
}

// fetchSoftware calls GET /api/v1/agent/software-catalog/:id?agentId=xxx
// to retrieve the full install details for a software item.
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
