package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Build-time values injected via -ldflags.
var (
	LDPlatformURL   string
	LDAccountToken  string
	LDEnrollmentKey string
)

type Config struct {
	PlatformURL   string `json:"PLATFORM_URL"`
	AccountToken  string `json:"ACCOUNT_TOKEN"`
	EnrollmentKey string `json:"ENROLLMENT_KEY"`
}

type fileConfig struct {
	PlatformURL   string `json:"PLATFORM_URL"`
	AccountToken  string `json:"ACCOUNT_TOKEN"`
	EnrollmentKey string `json:"ENROLLMENT_KEY"`
}

// configFileCandidates returns config.json paths to try, in priority order:
//  1. Same directory as the running executable (portable / dev)
//  2. Platform install directory (written by the install script)
func configFileCandidates() []string {
	candidates := []string{}

	// 1. Next to the executable
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "config.json"))
	}

	// 2. Platform install dir
	if runtime.GOOS == "windows" {
		candidates = append(candidates, `C:\ProgramData\racko-agent\config.json`)
	} else {
		candidates = append(candidates, "/etc/racko-agent/config.json")
	}

	return candidates
}

// Load resolves config with priority: ldflags > env vars > config.json
func Load() (*Config, error) {
	cfg := &Config{
		PlatformURL:   LDPlatformURL,
		AccountToken:  LDAccountToken,
		EnrollmentKey: LDEnrollmentKey,
	}

	if v := os.Getenv("PLATFORM_URL"); v != "" {
		cfg.PlatformURL = v
	}
	if v := os.Getenv("ACCOUNT_TOKEN"); v != "" {
		cfg.AccountToken = v
	}
	if v := os.Getenv("ENROLLMENT_KEY"); v != "" {
		cfg.EnrollmentKey = v
	}

	// Fall back to config.json if anything is still missing
	if cfg.PlatformURL == "" || (cfg.AccountToken == "" && cfg.EnrollmentKey == "") {
		for _, path := range configFileCandidates() {
			file, err := os.Open(path)
			if err != nil {
				continue // try next candidate
			}
			var fc fileConfig
			if err := json.NewDecoder(file).Decode(&fc); err == nil {
				if cfg.PlatformURL == "" {
					cfg.PlatformURL = fc.PlatformURL
				}
				if cfg.AccountToken == "" {
					cfg.AccountToken = fc.AccountToken
				}
				if cfg.EnrollmentKey == "" {
					cfg.EnrollmentKey = fc.EnrollmentKey
				}
			}
			file.Close()
			break // stop at first config file found
		}
	}

	return cfg, nil
}
