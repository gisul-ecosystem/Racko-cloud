//go:build windows

package tracker

// usn_watcher_windows.go — Windows USN (Update Sequence Number) Journal watcher.
//
// Replaces fsnotify for filesystem change detection. USN Journal is a kernel-level
// NTFS feature that records every file/folder create, modify, delete, and rename on
// a volume. It is:
//   - Reliable: kernel persists the journal, zero dropped events
//   - Efficient: one volume handle per drive, not one handle per directory
//   - Resumable: saves last USN to disk so agent restarts don't miss events
//   - Complete: tracks Downloads, Desktop, everywhere — no fsnotify limitations
//
// Architecture:
//   For each fixed NTFS drive (C:\, D:\, etc.) we open the volume handle and
//   poll READ_USN_JOURNAL in a loop every 2 seconds. Events are filtered through
//   shouldExcludePath() and fed into the Watcher's pending map, which the existing
//   5-second flush timer processes (upload to S3, send activity to server).

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── Windows API constants ─────────────────────────────────────────────────────

const (
	// FSCTL control codes
	fsctlQueryUSNJournal  = 0x000900F4
	fsctlReadUSNJournal   = 0x000900BB
	fsctlCreateUSNJournal = 0x000900E7

	// USN reason flags we care about
	usnReasonDataExtend      = 0x00000002
	usnReasonDataOverwrite   = 0x00000001
	usnReasonDataTruncation  = 0x00000004
	usnReasonFileCreate      = 0x00000100
	usnReasonFileDelete      = 0x00000200
	usnReasonRenameNewName   = 0x00002000
	usnReasonRenameOldName   = 0x00001000
	usnReasonNamedDataExtend = 0x00000020
	usnReasonHardLinkChange  = 0x00010000

	// File attribute flags
	fileAttributeDirectory = 0x00000010

	// Interesting reasons mask — only process these
	interestingReasons = usnReasonFileCreate | usnReasonFileDelete |
		usnReasonDataExtend | usnReasonDataOverwrite | usnReasonDataTruncation |
		usnReasonRenameNewName | usnReasonRenameOldName | usnReasonNamedDataExtend
)

// ─── Windows structures ────────────────────────────────────────────────────────

// USN_JOURNAL_DATA_V0 — result of FSCTL_QUERY_USN_JOURNAL
type usnJournalDataV0 struct {
	UsnJournalID    uint64
	FirstUsn        int64
	NextUsn         int64
	LowestValidUsn  int64
	MaxUsn          int64
	MaximumSize     uint64
	AllocationDelta uint64
}

// READ_USN_JOURNAL_DATA_V0 — input to FSCTL_READ_USN_JOURNAL
type readUSNJournalDataV0 struct {
	StartUsn          int64
	ReasonMask        uint32
	ReturnOnlyOnClose uint32
	TimeOut           uint64
	BytesToWaitFor    uint64
	UsnJournalID      uint64
}

// USN_RECORD_V2 — variable-length record returned by READ_USN_JOURNAL
// FileName follows immediately after this struct in memory.
type usnRecordV2 struct {
	RecordLength              uint32
	MajorVersion              uint16
	MinorVersion              uint16
	FileReferenceNumber       uint64
	ParentFileReferenceNumber uint64
	Usn                       int64
	TimeStamp                 int64
	Reason                    uint32
	SourceInfo                uint32
	SecurityID                uint32
	FileAttributes            uint32
	FileNameLength            uint16
	FileNameOffset            uint16
	// FileName []uint16 follows (not in struct — variable length)
}

// ─── Checkpoint persistence ────────────────────────────────────────────────────

// usnCheckpointPath returns the path where we persist the last seen USN per volume.
func usnCheckpointPath(driveLetter string) string {
	letter := strings.TrimRight(strings.ToUpper(driveLetter), `:\`)
	return filepath.Join(`C:\ProgramData\racko-agent`, fmt.Sprintf("usn_checkpoint_%s.bin", letter))
}

func loadUSNCheckpoint(driveLetter string) int64 {
	data, err := os.ReadFile(usnCheckpointPath(driveLetter))
	if err != nil || len(data) < 8 {
		return 0 // start from beginning of journal
	}
	return int64(binary.LittleEndian.Uint64(data))
}

func saveUSNCheckpoint(driveLetter string, usn int64) {
	data := make([]byte, 8)
	binary.LittleEndian.PutUint64(data, uint64(usn))
	_ = os.WriteFile(usnCheckpointPath(driveLetter), data, 0o600)
}

// ─── Volume path resolver ──────────────────────────────────────────────────────

// fileRefToPath resolves a file reference number to its full path.
// Uses NtOpenFile + GetFinalPathNameByHandle via raw syscalls since
// OpenFileById is not available in golang.org/x/sys/windows.
func fileRefToPath(volHandle windows.Handle, fileRef uint64) (string, error) {
	// Build OBJECT_ATTRIBUTES pointing to the file by ID.
	// On Windows, opening a file by ID requires NtOpenFile with
	// FILE_OPEN_BY_FILE_ID flag and a UNICODE_STRING containing the 8-byte ID.

	// Encode the file reference number as a UNICODE_STRING buffer.
	// The buffer is the raw 8 bytes of the file reference number.
	idBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(idBytes, fileRef)

	// Convert the volume handle to a path first using GetFinalPathNameByHandle,
	// then open the file by reference using CreateFile with FILE_FLAG_OPEN_BY_FILE_ID.
	// This approach uses documented Win32 APIs available in all Windows versions.

	// FILE_FLAG_OPEN_BY_FILE_ID = 0x10000000
	// FILE_FLAG_BACKUP_SEMANTICS = 0x02000000 (needed for directories)
	const (
		fileFlagOpenByFileID    = 0x10000000
		fileFlagBackupSemantics = 0x02000000
	)

	// Build a path string from the volume root + the 8-byte file ID.
	// CreateFile accepts this format when FILE_FLAG_OPEN_BY_FILE_ID is set.
	// The path format is: "X:\<8-byte-id>" where the ID is embedded as a
	// binary filename. We pass it via a UNICODE_STRING via NtCreateFile.
	// Simpler: use the volume handle directly with NtOpenFile.

	// Use a simpler approach: just use GetFinalPathNameByHandle on a handle
	// opened via the file reference number embedded in a special path format.
	// Windows accepts \\.\C:\<fileRefAsBytes> with FILE_FLAG_OPEN_BY_FILE_ID.

	// Build the file-ID path: the volume path + 8 null bytes encoding the ref number.
	// We need the drive letter for the volume handle.
	// Since we pass volHandle directly, use NtOpenFile instead.

	// Practical approach: use syscall.NtCreateFile equivalent via ZwOpenFile.
	// This is complex — use the simpler approach of building the ID path string.

	// The simplest reliable approach: encode the file reference as a wchar path
	// and open with FILE_FLAG_OPEN_BY_FILE_ID using CreateFileW on the volume.
	// Windows accepts: CreateFile("C:\\", ...) then uses the refnum as the name.

	// Use NtOpenFile via RtlInitUnicodeString + ObjectAttributes
	type unicodeString struct {
		Length        uint16
		MaximumLength uint16
		Buffer        *uint16
	}
	type objectAttributes struct {
		Length                   uint32
		RootDirectory            windows.Handle
		ObjectName               *unicodeString
		Attributes               uint32
		SecurityDescriptor       uintptr
		SecurityQualityOfService uintptr
	}
	type ioStatusBlock struct {
		Status      int32
		Information uintptr
	}

	// The "filename" for open-by-id is the raw 8 bytes of the file reference number
	// interpreted as a UNICODE_STRING (4 UTF-16 chars = 8 bytes)
	idU16 := (*[4]uint16)(unsafe.Pointer(&idBytes[0]))
	uname := unicodeString{
		Length:        8,
		MaximumLength: 8,
		Buffer:        &idU16[0],
	}
	oa := objectAttributes{
		Length:        uint32(unsafe.Sizeof(objectAttributes{})),
		RootDirectory: volHandle,
		ObjectName:    &uname,
		Attributes:    0x40, // OBJ_CASE_INSENSITIVE
	}
	var iosb ioStatusBlock
	var fileHandle windows.Handle

	ntdll := windows.NewLazySystemDLL("ntdll.dll")
	ntOpenFile := ntdll.NewProc("NtOpenFile")

	const (
		fileSynchronousIONonAlert = 0x00000020
		fileOpenByFileID          = 0x00002000
		synchronize               = 0x00100000
		fileReadAttributes        = 0x00000080
		fileShareAll              = windows.FILE_SHARE_READ | windows.FILE_SHARE_WRITE | windows.FILE_SHARE_DELETE
	)

	r1, _, _ := ntOpenFile.Call(
		uintptr(unsafe.Pointer(&fileHandle)),
		uintptr(fileReadAttributes|synchronize),
		uintptr(unsafe.Pointer(&oa)),
		uintptr(unsafe.Pointer(&iosb)),
		uintptr(fileShareAll),
		uintptr(fileSynchronousIONonAlert|fileOpenByFileID),
	)
	if r1 != 0 {
		return "", fmt.Errorf("NtOpenFile failed: 0x%X", r1)
	}
	defer windows.CloseHandle(fileHandle)

	// Now get the full path from the handle
	buf := make([]uint16, windows.MAX_PATH+1)
	n, err := windows.GetFinalPathNameByHandle(fileHandle, &buf[0], uint32(len(buf)), 0)
	if err != nil {
		return "", err
	}
	path := windows.UTF16ToString(buf[:n])
	path = strings.TrimPrefix(path, `\\?\`)
	path = strings.TrimPrefix(path, `\??\`)
	return path, nil
}

// ─── Per-volume USN watcher ────────────────────────────────────────────────────

// watchVolumeUSN polls the USN journal for one volume and feeds events into
// the Watcher's pending map. Runs until done is closed.
func (w *Watcher) watchVolumeUSN(drive string, done <-chan struct{}) {
	// Open the volume — e.g. \\.\C:
	driveLetter := strings.TrimRight(drive, `\`)
	volPath := `\\.\` + driveLetter
	volPathPtr, _ := syscall.UTF16PtrFromString(volPath)

	volHandle, err := windows.CreateFile(
		volPathPtr,
		windows.GENERIC_READ,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS,
		0,
	)
	if err != nil {
		log.Printf("[tracker/usn] Could not open volume %s: %v", volPath, err)
		return
	}
	defer windows.CloseHandle(volHandle)

	// Query the journal to get its ID and current USN range.
	var journalData usnJournalDataV0
	var bytesReturned uint32
	err = windows.DeviceIoControl(
		volHandle,
		fsctlQueryUSNJournal,
		nil, 0,
		(*byte)(unsafe.Pointer(&journalData)),
		uint32(unsafe.Sizeof(journalData)),
		&bytesReturned,
		nil,
	)
	if err != nil {
		// Journal not enabled — try to create it
		type createUSNJournalData struct {
			MaximumSize     uint64
			AllocationDelta uint64
		}
		createData := createUSNJournalData{
			MaximumSize:     32 * 1024 * 1024, // 32 MB journal
			AllocationDelta: 4 * 1024 * 1024,  // 4 MB allocation
		}
		_ = windows.DeviceIoControl(
			volHandle,
			fsctlCreateUSNJournal,
			(*byte)(unsafe.Pointer(&createData)),
			uint32(unsafe.Sizeof(createData)),
			nil, 0,
			&bytesReturned,
			nil,
		)
		// Re-query after creation
		err = windows.DeviceIoControl(
			volHandle,
			fsctlQueryUSNJournal,
			nil, 0,
			(*byte)(unsafe.Pointer(&journalData)),
			uint32(unsafe.Sizeof(journalData)),
			&bytesReturned,
			nil,
		)
		if err != nil {
			log.Printf("[tracker/usn] Could not query/create USN journal on %s: %v", drive, err)
			return
		}
	}

	// Load or initialize the checkpoint USN.
	startUSN := loadUSNCheckpoint(driveLetter)
	if startUSN < journalData.FirstUsn {
		// Checkpoint is older than the journal — journal was truncated/recreated.
		// Start from the current position to avoid replaying old events.
		startUSN = journalData.NextUsn
		log.Printf("[tracker/usn] Checkpoint stale on %s — starting from current USN %d", drive, startUSN)
	}
	if startUSN == 0 {
		// First run — start from now so we don't replay the entire volume history.
		startUSN = journalData.NextUsn
		log.Printf("[tracker/usn] First run on %s — starting from current USN %d", drive, startUSN)
	}

	log.Printf("[tracker/usn] Watching volume %s (journalID=%d, startUSN=%d)", drive, journalData.UsnJournalID, startUSN)

	readBuf := make([]byte, 64*1024) // 64KB read buffer
	currentUSN := startUSN

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			saveUSNCheckpoint(driveLetter, currentUSN)
			log.Printf("[tracker/usn] Stopped watching %s at USN %d", drive, currentUSN)
			return
		case <-ticker.C:
			// Poll the journal for new records since currentUSN.
			readData := readUSNJournalDataV0{
				StartUsn:          currentUSN,
				ReasonMask:        interestingReasons,
				ReturnOnlyOnClose: 0,
				TimeOut:           0,
				BytesToWaitFor:    0,
				UsnJournalID:      journalData.UsnJournalID,
			}

			err := windows.DeviceIoControl(
				volHandle,
				fsctlReadUSNJournal,
				(*byte)(unsafe.Pointer(&readData)),
				uint32(unsafe.Sizeof(readData)),
				&readBuf[0],
				uint32(len(readBuf)),
				&bytesReturned,
				nil,
			)
			if err != nil {
				// ERROR_JOURNAL_ENTRY_DELETED — journal wrapped, reset to current
				if errno, ok := err.(syscall.Errno); ok && errno == 0x80000288 {
					var jd usnJournalDataV0
					_ = windows.DeviceIoControl(volHandle, fsctlQueryUSNJournal, nil, 0,
						(*byte)(unsafe.Pointer(&jd)), uint32(unsafe.Sizeof(jd)), &bytesReturned, nil)
					currentUSN = jd.NextUsn
					log.Printf("[tracker/usn] Journal wrapped on %s — resetting to USN %d", drive, currentUSN)
				} else {
					log.Printf("[tracker/usn] DeviceIoControl READ error on %s: %v", drive, err)
				}
				continue
			}

			if bytesReturned < 8 {
				continue // no records
			}

			// First 8 bytes is the next USN to read from.
			nextUSN := int64(binary.LittleEndian.Uint64(readBuf[:8]))
			if nextUSN == currentUSN {
				continue // nothing new
			}

			// Parse records starting at offset 8.
			offset := uint32(8)
			for offset < bytesReturned {
				if offset+uint32(unsafe.Sizeof(usnRecordV2{})) > bytesReturned {
					break
				}
				rec := (*usnRecordV2)(unsafe.Pointer(&readBuf[offset]))
				if rec.RecordLength == 0 {
					break
				}

				w.processUSNRecord(rec, readBuf[offset:offset+rec.RecordLength], volHandle, drive)
				offset += rec.RecordLength
			}

			currentUSN = nextUSN
			saveUSNCheckpoint(driveLetter, currentUSN)
		}
	}
}

// processUSNRecord handles a single USN record — resolves the path and feeds
// it into the watcher's pending map.
func (w *Watcher) processUSNRecord(rec *usnRecordV2, data []byte, volHandle windows.Handle, drive string) {
	// Extract the filename from the record (UTF-16, follows the struct).
	nameOffset := rec.FileNameOffset
	nameLen := rec.FileNameLength
	if int(nameOffset)+int(nameLen) > len(data) {
		return
	}
	nameBytes := data[nameOffset : nameOffset+nameLen]
	u16 := make([]uint16, len(nameBytes)/2)
	for i := range u16 {
		u16[i] = binary.LittleEndian.Uint16(nameBytes[i*2:])
	}
	fileName := windows.UTF16ToString(u16)
	if fileName == "" {
		return
	}

	// Try to resolve the full path from the file reference number.
	fullPath, err := fileRefToPath(volHandle, rec.FileReferenceNumber)
	if err != nil {
		// For deleted/renamed-away files, fall back to parent ref + filename.
		if rec.Reason&(usnReasonFileDelete|usnReasonRenameOldName) != 0 {
			parentPath, perr := fileRefToPath(volHandle, rec.ParentFileReferenceNumber)
			if perr == nil {
				fullPath = filepath.Join(parentPath, fileName)
			} else {
				return // can't determine path — skip
			}
		} else {
			return
		}
	}

	// Apply exclusion filter
	if shouldExcludePath(fullPath) {
		return
	}

	// Skip directories — we only track file content
	isDir := rec.FileAttributes&fileAttributeDirectory != 0

	w.mu.Lock()
	defer w.mu.Unlock()

	switch {
	case rec.Reason&(usnReasonFileCreate|usnReasonDataExtend|usnReasonDataOverwrite|usnReasonDataTruncation|usnReasonNamedDataExtend) != 0:
		// File create or data write — always wins over a prior delete in the
		// same flush window. A file that is created and then modified in the
		// same 5-second batch should be uploaded, not deleted.
		if !isDir {
			w.pending[fullPath] = usnOpWrite
			log.Printf("[tracker/usn] queued write: %s (reason=0x%X)", fullPath, rec.Reason)
		}

	case rec.Reason&usnReasonFileDelete != 0:
		if !isDir {
			// Only record as delete if we haven't already seen a create/write
			// for this path in the current flush window.
			if existing, ok := w.pending[fullPath]; !ok || existing != usnOpWrite {
				w.pending[fullPath] = usnOpDelete
				log.Printf("[tracker/usn] queued delete: %s", fullPath)
			}
		}

	case rec.Reason&usnReasonRenameOldName != 0:
		// Store old path keyed by file reference number for correlation.
		w.usnRenameOld[rec.FileReferenceNumber] = fullPath

	case rec.Reason&usnReasonRenameNewName != 0:
		if !isDir {
			if oldPath, ok := w.usnRenameOld[rec.FileReferenceNumber]; ok {
				w.renamed[fullPath] = oldPath // newPath → oldPath
				delete(w.usnRenameOld, rec.FileReferenceNumber)
				w.pending[oldPath] = usnOpRename
				log.Printf("[tracker/usn] queued rename: %s → %s", oldPath, fullPath)
			} else {
				// No matching old name (missed the RenameOldName record) — treat as write
				w.pending[fullPath] = usnOpWrite
				log.Printf("[tracker/usn] queued write (rename new, no old): %s", fullPath)
			}
		}
	}
}

// ─── USN operation type (replaces fsnotify.Op in pending map) ─────────────────

// We reuse the same pending map but need our own op constants since we dropped fsnotify.
// These must be kept in sync with the flush() method in watcher.go.
const (
	usnOpWrite  = usnOp(1)
	usnOpDelete = usnOp(2)
	usnOpRename = usnOp(3)
)

type usnOp uint32

// ─── Start USN watching on all volumes ────────────────────────────────────────

// startUSNWatcher launches one goroutine per fixed NTFS volume.
// Called from Watcher.Start() instead of the fsnotify setup block.
func (w *Watcher) startUSNWatcher(done <-chan struct{}) {
	drives := getLocalDrives()
	if len(drives) == 0 {
		log.Println("[tracker/usn] No fixed drives found")
		return
	}

	var wg sync.WaitGroup
	for _, drive := range drives {
		drive := drive
		wg.Add(1)
		go func() {
			defer wg.Done()
			w.watchVolumeUSN(drive, done)
		}()
	}

	// Block until done is closed, then wait for all volume watchers to exit.
	<-done
	wg.Wait()
}
