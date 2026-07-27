//go:build windows

// Package winsvc implements the Windows Service Control Manager protocol.
// When the agent binary is started by Windows as a service, it must call
// svc.Run() to signal readiness and handle Stop/Shutdown commands.
package winsvc

import (
	"log"

	"golang.org/x/sys/windows/svc"
)

const ServiceName = "RackoAgent"

// handler implements svc.Handler — called by the SCM.
type handler struct {
	run func(done <-chan struct{})
}

// Execute is called by svc.Run when the service starts.
// It signals "running" to SCM, then calls the agent's main loop.
func (h *handler) Execute(args []string, req <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	// Tell SCM we accept Stop and Shutdown
	status <- svc.Status{State: svc.StartPending}

	done := make(chan struct{})

	// Signal running
	status <- svc.Status{
		State:   svc.Running,
		Accepts: svc.AcceptStop | svc.AcceptShutdown,
	}

	log.Println("[winsvc] Service started")

	// Start the agent's main loop in a goroutine
	go h.run(done)

	// Handle SCM control requests
	for c := range req {
		switch c.Cmd {
		case svc.Stop, svc.Shutdown:
			log.Println("[winsvc] Stop/Shutdown received")
			status <- svc.Status{State: svc.StopPending}
			close(done)
			return false, 0
		default:
			log.Printf("[winsvc] Unexpected control request: %d", c.Cmd)
		}
	}

	return false, 0
}

// Run starts the agent as a proper Windows service.
// runFn receives a done channel that closes when SCM sends Stop/Shutdown.
func Run(runFn func(done <-chan struct{})) error {
	return svc.Run(ServiceName, &handler{run: runFn})
}

// IsWindowsService returns true when running under the SCM (not interactively).
func IsWindowsService() bool {
	ok, err := svc.IsWindowsService()
	if err != nil {
		return false
	}
	return ok
}
