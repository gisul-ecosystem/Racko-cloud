package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

type agentData struct {
	AgentID      string `json:"agent_id"`
	AccountToken string `json:"account_token,omitempty"`
}

func dataDir() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\racko-agent`
	}
	return "/etc/racko-agent"
}

func dataFilePath() string {
	return filepath.Join(dataDir(), "agent.json")
}

func readData() (agentData, error) {
	var d agentData
	data, err := os.ReadFile(dataFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return d, nil
		}
		return d, err
	}
	err = json.Unmarshal(data, &d)
	return d, err
}

func writeData(d agentData) error {
	if err := os.MkdirAll(dataDir(), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(d)
	if err != nil {
		return err
	}
	return os.WriteFile(dataFilePath(), data, 0o600)
}

// ReadAgentID returns the persisted agent ID, or "" if not yet registered.
func ReadAgentID() (string, error) {
	d, err := readData()
	return d.AgentID, err
}

// WriteAgentID persists the agent ID to disk.
func WriteAgentID(agentID string) error {
	d, _ := readData()
	d.AgentID = agentID
	return writeData(d)
}

// WriteAccountToken persists the accountToken returned during enrollment.
func WriteAccountToken(token string) error {
	d, _ := readData()
	d.AccountToken = token
	return writeData(d)
}

// ReadAccountToken returns the persisted accountToken (enrollment flow only).
func ReadAccountToken() (string, error) {
	d, err := readData()
	return d.AccountToken, err
}
