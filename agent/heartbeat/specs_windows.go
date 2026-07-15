//go:build windows

package heartbeat

import (
	"os"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

func collectSpecs() MachineSpecs {
	hostname, _ := os.Hostname()

	// RAM via GlobalMemoryStatusEx
	type memoryStatusEx struct {
		Length                uint32
		MemoryLoad            uint32
		TotalPhys             uint64
		AvailPhys             uint64
		TotalPageFile         uint64
		AvailPageFile         uint64
		TotalVirtual          uint64
		AvailVirtual          uint64
		AvailExtendedVirtual  uint64
	}
	kernel32 := windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")
	var mem memoryStatusEx
	mem.Length = uint32(unsafe.Sizeof(mem))
	ramGB := 0.0
	ret, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&mem)))
	if ret != 0 {
		ramGB = float64(int(float64(mem.TotalPhys)/(1024*1024*1024)*10)) / 10
	}

	// Disk via GetDiskFreeSpaceExW on C:\
	diskGB := 0.0
	root, err := windows.UTF16PtrFromString(`C:\`)
	if err == nil {
		var freeBytesAvail, totalBytes, freeBytes uint64
		if e := windows.GetDiskFreeSpaceEx(root, &freeBytesAvail, &totalBytes, &freeBytes); e == nil {
			diskGB = float64(int(float64(totalBytes)/(1024*1024*1024)*10)) / 10
		}
	}

	// OS version via RtlGetVersion
	osVersion := "Windows"
	if info := windows.RtlGetVersion(); info != nil {
		osVersion = "Windows " + itoa(int(info.MajorVersion)) + "." + itoa(int(info.MinorVersion)) +
			" Build " + itoa(int(info.BuildNumber))
	}

	return MachineSpecs{
		Hostname:  hostname,
		OSVersion: osVersion,
		CPUCores:  runtime.NumCPU(),
		RAMGB:     ramGB,
		DiskGB:    diskGB,
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 10)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}
