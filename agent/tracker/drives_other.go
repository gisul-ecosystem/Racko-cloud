//go:build !windows

package tracker

// getLocalDrives returns a no-op empty slice on non-Windows.
// The watcher uses getWatchPaths() directly on Linux/macOS.
func getLocalDrives() []string {
	return nil
}

func getDriveExcludePrefix(_ string) []string {
	return nil
}
