package retry

import (
	"log"
	"time"
)

// backoffSchedule defines the wait time before each retry attempt (0-indexed).
var backoffSchedule = []time.Duration{
	10 * time.Second,
	30 * time.Second,
	60 * time.Second,
}

// OnRetry is called after each failed attempt with the current attempt number (1-based)
// and accumulated logs. Return value is the status string to report ("retrying" or "failed").
type OnRetry func(attempt int, logs string)

// Run executes fn up to maxAttempts (3) times with increasing backoff.
// onRetry is called after each failure. Returns the final logs and a bool
// indicating overall success.
func Run(fn func() (string, error), onRetry OnRetry) (logs string, success bool) {
	const maxAttempts = 3

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result, err := fn()
		logs = result

		if err == nil {
			return logs, true
		}

		log.Printf("[retry] Attempt %d/%d failed: %v", attempt, maxAttempts, err)

		if attempt < maxAttempts {
			onRetry(attempt, logs)
			delay := backoffSchedule[attempt-1]
			log.Printf("[retry] Waiting %s before next attempt…", delay)
			time.Sleep(delay)
		} else {
			// Final attempt failed.
			onRetry(attempt, logs)
		}
	}

	return logs, false
}
