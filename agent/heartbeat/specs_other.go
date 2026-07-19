//go:build !windows

package heartbeat

import (
	"os"
	"runtime"
	"syscall"
)

func collectSpecs() MachineSpecs {
	hostname, _ := os.Hostname()

	// RAM via syscall
	ramGB := 0.0
	var si syscall.Sysinfo_t
	if err := syscall.Sysinfo(&si); err == nil {
		ramGB = float64(int(float64(si.Totalram)/(1024*1024*1024)*10)) / 10
	}

	// Disk via statfs on /
	diskGB := 0.0
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		total := stat.Blocks * uint64(stat.Bsize)
		diskGB = float64(int(float64(total)/(1024*1024*1024)*10)) / 10
	}

	return MachineSpecs{
		Hostname:  hostname,
		OSVersion: runtime.GOOS,
		CPUCores:  runtime.NumCPU(),
		RAMGB:     ramGB,
		DiskGB:    diskGB,
	}
}
