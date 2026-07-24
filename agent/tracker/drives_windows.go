//go:build windows

package tracker

import (
	"log"
	"unsafe"

	"golang.org/x/sys/windows"
)

// getLocalDrives returns all local fixed drives on this Windows machine.
// Uses GetLogicalDriveStrings (Win32 API) which returns a null-separated
// list of drive root paths like "C:\", "D:\", "E:\".
//
// Only DRIVE_FIXED drives are included (physical/virtual HDDs/SSDs).
// Network drives, CD-ROM, RAM disks, and removable drives are excluded
// because they are either transient or not relevant for VM change tracking.
func getLocalDrives() []string {
	// First call: get required buffer size
	size, err := windows.GetLogicalDriveStrings(0, nil)
	if err != nil || size == 0 {
		log.Printf("[tracker/drives] GetLogicalDriveStrings size query failed: %v — falling back to C:\\", err)
		return []string{`C:\`}
	}

	// Second call: fill the buffer
	buf := make([]uint16, size)
	_, err = windows.GetLogicalDriveStrings(size, &buf[0])
	if err != nil {
		log.Printf("[tracker/drives] GetLogicalDriveStrings fill failed: %v — falling back to C:\\", err)
		return []string{`C:\`}
	}

	// Parse null-separated UTF-16 strings into Go strings
	var drives []string
	start := 0
	for i, c := range buf {
		if c == 0 {
			if i > start {
				drive := windows.UTF16ToString(buf[start:i])
				if drive != "" {
					// Only include fixed local drives (type 3 = DRIVE_FIXED)
					drivePtr, _ := windows.UTF16PtrFromString(drive)
					driveType := windows.GetDriveType(drivePtr)
					if driveType == windows.DRIVE_FIXED {
						drives = append(drives, drive)
						log.Printf("[tracker/drives] Found fixed drive: %s", drive)
					} else {
						log.Printf("[tracker/drives] Skipping drive %s (type=%d)", drive, driveType)
					}
				}
			}
			start = i + 1
		}
	}

	if len(drives) == 0 {
		log.Println("[tracker/drives] No fixed drives found — falling back to C:\\")
		return []string{`C:\`}
	}

	return drives
}

// getDriveExcludePrefix returns the system folders on a given drive root
// that should never be recursively watched. For C:\ this is C:\Windows.
// For other drives, only the recycle bin is excluded.
func getDriveExcludePrefix(drive string) []string {
	// Normalise to uppercase letter only
	letter := drive
	if len(drive) >= 1 {
		letter = string([]byte{drive[0] &^ 0x20}) // to uppercase
	}

	base := letter + `:\`

	excludes := []string{
		base + `$Recycle.Bin`,
		base + `System Volume Information`,
	}

	// C:\ has additional Windows system folders to exclude
	if letter == "C" {
		excludes = append(excludes,
			`C:\Windows`,
			`C:\ProgramData\Microsoft`,
			`C:\ProgramData\Windows`,
			`C:\ProgramData\Package Cache`,
			`C:\ProgramData\USOPrivate`,
			`C:\ProgramData\USOShared`,
			`C:\ProgramData\SoftwareDistribution`,
		)
	}

	return excludes
}

// Ensure the unsafe import is used (needed for windows package internals)
var _ = unsafe.Sizeof(0)
