//go:build windows

package register

import (
	"os/exec"
	"strings"
)

// readCpuID reads the processor ID from the Windows registry via wmic.
func readCpuID() string {
	// TODO: Replace wmic with a direct registry read for better compatibility on Windows 11+
	out, err := exec.Command("wmic", "cpu", "get", "ProcessorId", "/value").Output()
	if err != nil {
		return "unknown"
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "ProcessorId=") {
			return strings.TrimPrefix(line, "ProcessorId=")
		}
	}
	return "unknown"
}
