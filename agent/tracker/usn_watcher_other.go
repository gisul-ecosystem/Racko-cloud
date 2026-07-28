//go:build !windows

package tracker

// usn_watcher_other.go — stub for non-Windows platforms.
// USN Journal is a Windows NTFS-only feature. On Linux/macOS the watcher
// falls back to a no-op (Linux/Mac builds are used for the server-side agent
// only and do not need filesystem tracking).

// usnOp is a placeholder type on non-Windows builds.
type usnOp uint32

const (
	usnOpWrite  = usnOp(1)
	usnOpDelete = usnOp(2)
	usnOpRename = usnOp(3)
)

// startUSNWatcher is a no-op on non-Windows platforms.
func (w *Watcher) startUSNWatcher(done <-chan struct{}) {
	<-done // block until stopped
}
