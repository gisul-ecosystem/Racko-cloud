package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Config holds the shared settings read from the agent's config.json.
// The GUI app reuses the same config file the service uses — no duplication.
type Config struct {
	PlatformURL  string `json:"PLATFORM_URL"`
	AccountToken string `json:"ACCOUNT_TOKEN"`
}

// agentDataFile returns the path to agent.json (contains persisted agentId).
func agentDataFile() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\racko-agent\agent.json`
	}
	return "/etc/racko-agent/agent.json"
}

// configFile returns the path to config.json written by the installer.
func configFile() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\racko-agent\config.json`
	}
	return "/etc/racko-agent/config.json"
}

// Load reads config.json and returns a Config.
func Load() (*Config, error) {
	data, err := os.ReadFile(configFile())
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// ReadAgentID reads the persisted agentId from agent.json.
func ReadAgentID() (string, error) {
	data, err := os.ReadFile(agentDataFile())
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	var d struct {
		AgentID string `json:"agent_id"`
	}
	if err := json.Unmarshal(data, &d); err != nil {
		return "", err
	}
	return d.AgentID, nil
}

// CacheDir returns a writable directory for the app's local cache.
func CacheDir() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("APPDATA")
		if base == "" {
			base = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		return filepath.Join(base, "RackoApp")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".racko-app")
}
