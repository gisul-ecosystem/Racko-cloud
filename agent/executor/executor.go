package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/installer"
	"github.com/racko-ai/agent/poller"
	"github.com/racko-ai/agent/reporter"
	"github.com/racko-ai/agent/retry"
)

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
	log.Printf("[executor] ▶ JOB START id=%s packages=%d agentId=%s",
		job.ID, len(job.SoftwareIDs), e.agentID)

	// Report installing immediately
	log.Printf("[executor] Reporting status=installing for job=%s", job.ID)
	if err := e.rep.Report(job.ID, e.agentID, "installing", ""); err != nil {
		log.Printf("[executor] ERROR reporting 'installing' for job=%s: %v", job.ID, err)
	} else {
		log.Printf("[executor] Reported status=installing for job=%s OK", job.ID)
	}

	var combinedLogs string

	for i, swID := range job.SoftwareIDs {
		log.Printf("[executor] Processing software %d/%d id=%s for job=%s", i+1, len(job.SoftwareIDs), swID, job.ID)

		// Fetch full software record from platform
		log.Printf("[executor] Fetching software details for id=%s", swID)
		pkg, err := e.fetchSoftware(swID)
		if err != nil {
			log.Printf("[executor] ERROR fetching software id=%s: %v", swID, err)
			combinedLogs += fmt.Sprintf("[error] Could not fetch software %s: %v\n", swID, err)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] ERROR reporting 'failed' for job=%s: %v", job.ID, err)
			}
			continue
		}
		log.Printf("[executor] Fetched software: name=%s version=%s method=%s chocoName=%s wingetId=%s",
			pkg.Name, pkg.Version, pkg.InstallMethod, pkg.ChocoName, pkg.WingetID)

		log.Printf("[executor] ▶ INSTALL START name=%s version=%s method=%s job=%s",
			pkg.Name, pkg.Version, pkg.InstallMethod, job.ID)

		logs, success := retry.Run(
			func() (string, error) {
				log.Printf("[executor] Calling installer.Install for name=%s method=%s", pkg.Name, pkg.InstallMethod)
				startTime := time.Now()

				// Install with 30-minute timeout
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
				defer cancel()

				resultChan := make(chan struct {
					logs string
					err  error
				}, 1)

				go func() {
					log.Printf("[executor] installer goroutine started for name=%s", pkg.Name)
					l, e := installer.Install(*pkg)
					log.Printf("[executor] installer goroutine finished for name=%s err=%v logsLen=%d", pkg.Name, e, len(l))
					resultChan <- struct {
						logs string
						err  error
					}{l, e}
				}()

				log.Printf("[executor] Waiting for installer result for name=%s (timeout=30min)", pkg.Name)
				select {
				case result := <-resultChan:
					elapsed := time.Since(startTime)
					if result.err != nil {
						log.Printf("[executor] INSTALL ERROR name=%s elapsed=%s err=%v", pkg.Name, elapsed, result.err)
						log.Printf("[executor] INSTALL OUTPUT name=%s:\n%s", pkg.Name, result.logs)
					} else {
						log.Printf("[executor] INSTALL SUCCESS name=%s elapsed=%s", pkg.Name, elapsed)
						log.Printf("[executor] INSTALL OUTPUT name=%s:\n%s", pkg.Name, result.logs)
					}
					return result.logs, result.err
				case <-ctx.Done():
					log.Printf("[executor] INSTALL TIMEOUT name=%s after 30 minutes", pkg.Name)
					return "", fmt.Errorf("install timeout after 30 minutes")
				}
			},
			func(attempt int, logs string) {
				combinedLogs += logs
				status := "retrying"
				if attempt >= 3 {
					status = "failed"
				}
				log.Printf("[executor] Attempt %d failed for name=%s job=%s — reporting status=%s", attempt, pkg.Name, job.ID, status)
				if err := e.rep.Report(job.ID, e.agentID, status, combinedLogs); err != nil {
					log.Printf("[executor] ERROR reporting '%s' for job=%s: %v", status, job.ID, err)
				}
			},
		)

		combinedLogs += logs

		if !success {
			log.Printf("[executor] ✗ INSTALL FAILED name=%s job=%s — continuing with next software", pkg.Name, job.ID)
			if err := e.rep.Report(job.ID, e.agentID, "failed", combinedLogs); err != nil {
				log.Printf("[executor] ERROR reporting final 'failed' for job=%s: %v", job.ID, err)
			}
			continue
		}

		log.Printf("[executor] ✓ INSTALL DONE name=%s job=%s", pkg.Name, job.ID)
	}

	log.Printf("[executor] ▶ JOB COMPLETE id=%s — reporting success", job.ID)
	if err := e.rep.Report(job.ID, e.agentID, "success", combinedLogs); err != nil {
		log.Printf("[executor] ERROR reporting 'success' for job=%s: %v", job.ID, err)
	} else {
		log.Printf("[executor] Reported status=success for job=%s OK", job.ID)
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
