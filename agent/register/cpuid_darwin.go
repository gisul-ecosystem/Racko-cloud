//go:build darwin

package register

import (
	"os/exec"
	"strings"
)

// readCpuID reads the hardware UUID via sysctl on macOS.
func readCpuID() string {
	out, err := exec.Command("sysctl", "-n", "hw.uuid").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}
