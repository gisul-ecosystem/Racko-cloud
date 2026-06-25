package register

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/racko-ai/agent/config"
	"github.com/racko-ai/agent/store"
)

// ─── Register (accountToken flow — Physical Machine / VM push) ────────────────

type registerRequest struct {
	AccountToken string `json:"accountToken"`
	Hostname     string `json:"hostname"`
	MAC          string `json:"mac"`
	OS           string `json:"os"`
	CpuID        string `json:"cpuId"`
}

type registerResponse struct {
	Data struct {
		AgentID string `json:"agentId"`
	} `json:"data"`
}

// ─── Enroll (enrollmentKey flow — VM Template) ────────────────────────────────

type enrollRequest struct {
	EnrollmentKey string `json:"enrollmentKey"`
	Hostname      string `json:"hostname"`
	MAC           string `json:"mac"`
	OS            string `json:"os"`
	CpuID         string `json:"cpuId"`
}

type enrollResponse struct {
	Data struct {
		AgentID      string `json:"agentId"`
		AccountToken string `json:"accountToken"`
	} `json:"data"`
}

// Run decides which registration flow to use based on what is configured:
//   - If AccountToken is set → standard register flow (physical/VM push)
//   - If EnrollmentKey is set → enrollment flow (VM template)
//
// On success the agentId (and accountToken for enroll flow) are persisted via store.
func Run(cfg *config.Config) (string, error) {
	fingerprint, err := collectFingerprint()
	if err != nil {
		return "", fmt.Errorf("fingerprint collection failed: %w", err)
	}

	if cfg.AccountToken != "" {
		return runRegister(cfg.PlatformURL, cfg.AccountToken, fingerprint)
	}
	if cfg.EnrollmentKey != "" {
		return runEnroll(cfg.PlatformURL, cfg.EnrollmentKey, fingerprint)
	}
	return "", fmt.Errorf("neither ACCOUNT_TOKEN nor ENROLLMENT_KEY is configured")
}

func runRegister(platformURL, accountToken string, fp fingerprint) (string, error) {
	req := registerRequest{
		AccountToken: accountToken,
		Hostname:     fp.hostname,
		MAC:          fp.mac,
		OS:           fp.os,
		CpuID:        fp.cpuID,
	}

	const maxAttempts = 3
	const retryDelay = 5 * time.Second

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		agentID, err := doRegister(platformURL, req)
		if err != nil {
			log.Printf("[register] Attempt %d/%d failed: %v", attempt, maxAttempts, err)
			if attempt < maxAttempts {
				time.Sleep(retryDelay)
				continue
			}
			return "", fmt.Errorf("registration failed after %d attempts: %w", maxAttempts, err)
		}

		if err := store.WriteAgentID(agentID); err != nil {
			return "", fmt.Errorf("failed to persist agent ID: %w", err)
		}

		log.Printf("[register] Registered. agentId=%s", agentID)
		return agentID, nil
	}
	return "", fmt.Errorf("registration failed")
}

func runEnroll(platformURL, enrollmentKey string, fp fingerprint) (string, error) {
	req := enrollRequest{
		EnrollmentKey: enrollmentKey,
		Hostname:      fp.hostname,
		MAC:           fp.mac,
		OS:            fp.os,
		CpuID:         fp.cpuID,
	}

	const maxAttempts = 3
	const retryDelay = 5 * time.Second

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		agentID, accountToken, err := doEnroll(platformURL, req)
		if err != nil {
			log.Printf("[enroll] Attempt %d/%d failed: %v", attempt, maxAttempts, err)
			if attempt < maxAttempts {
				time.Sleep(retryDelay)
				continue
			}
			return "", fmt.Errorf("enrollment failed after %d attempts: %w", maxAttempts, err)
		}

		if err := store.WriteAgentID(agentID); err != nil {
			return "", fmt.Errorf("failed to persist agent ID: %w", err)
		}
		// Persist the accountToken returned by enrollment for future use
		if err := store.WriteAccountToken(accountToken); err != nil {
			log.Printf("[enroll] Warning: could not persist accountToken: %v", err)
		}

		log.Printf("[enroll] Enrolled. agentId=%s", agentID)
		return agentID, nil
	}
	return "", fmt.Errorf("enrollment failed")
}

func doRegister(platformURL string, req registerRequest) (string, error) {
	body, _ := json.Marshal(req)
	resp, err := http.Post(platformURL+"/api/v1/agent/register", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result registerResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Data.AgentID == "" {
		return "", fmt.Errorf("empty agentId in response")
	}
	return result.Data.AgentID, nil
}

func doEnroll(platformURL string, req enrollRequest) (string, string, error) {
	body, _ := json.Marshal(req)
	resp, err := http.Post(platformURL+"/api/v1/agent/enroll", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return "", "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result enrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}
	if result.Data.AgentID == "" {
		return "", "", fmt.Errorf("empty agentId in response")
	}
	return result.Data.AgentID, result.Data.AccountToken, nil
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────

type fingerprint struct {
	hostname string
	mac      string
	os       string
	cpuID    string
}

func collectFingerprint() (fingerprint, error) {
	hostname, _ := os.Hostname()
	return fingerprint{
		hostname: hostname,
		mac:      firstNonLoopbackMAC(),
		os:       runtime.GOOS,
		cpuID:    readCpuID(),
	}, nil
}

func firstNonLoopbackMAC() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "unknown"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback == 0 && len(iface.HardwareAddr) > 0 {
			return iface.HardwareAddr.String()
		}
	}
	return "unknown"
}
