//go:build windows

package register

import (
	"os/exec"
	"strings"
)

// readCpuID reads the processor ID via PowerShell Get-CimInstance.
// wmic is deprecated and removed on Windows 11 24H2+; CIM is the modern replacement.
func readCpuID() string {
	// Primary: Get-CimInstance (works on all modern Windows versions)
	out, err := exec.Command("powershell.exe", "-NonInteractive", "-Command",
		"(Get-CimInstance Win32_Processor).ProcessorId").Output()
	if err == nil {
		id := strings.TrimSpace(string(out))
		if id != "" {
			return id
		}
	}

	// Fallback: wmic for older Windows versions that still have it
	out, err = exec.Command("wmic", "cpu", "get", "ProcessorId", "/value").Output()
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
