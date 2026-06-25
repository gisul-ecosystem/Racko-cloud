//go:build !windows

package winsvc

// IsWindowsService always returns false on non-Windows platforms.
func IsWindowsService() bool { return false }

// Run is a no-op on non-Windows — never called.
func Run(_ func(done <-chan struct{})) error { return nil }
