// Package download provides a production-ready HTTP file downloader with:
//   - Per-read idle timeout via a custom DialContext that captures net.Conn
//   - Automatic retry with exponential backoff
//   - Progress logging every 10 MB
//   - Partial file cleanup before each retry
//
// This is the pattern used by Docker, Kubernetes, and Go's own toolchain.
// The key insight: http.Client.Timeout is an end-to-end deadline, NOT an
// idle timeout. A stalled connection holds it open for the full duration
// without transferring a single byte. This package solves that by calling
// conn.SetReadDeadline before every read — active downloads extend it
// continuously, stalled ones fail within IdleTimeout.
package download

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	// IdleTimeout is how long to wait for any bytes before declaring the
	// connection stalled. 30 seconds matches nginx/Cloudflare upstream timeout.
	IdleTimeout = 30 * time.Second

	// MaxRetries is the number of download attempts before giving up.
	MaxRetries = 3

	// logEveryBytes emits a progress log line every 10 MB.
	logEveryBytes = 10 * 1024 * 1024
)

// File downloads url to destPath with idle timeout, retry, and progress logging.
// Returns the hex-encoded SHA256 of the downloaded file.
// Deletes any partial file before each retry — caller gets a complete file
// on success or no file on failure.
// label is used in log lines (e.g. "racko-app.zip").
func File(url, destPath, label string) (sha256hex string, err error) {
	var lastErr error
	for attempt := 1; attempt <= MaxRetries; attempt++ {
		// Clean up any partial file from a previous attempt
		_ = os.Remove(destPath)

		if attempt > 1 {
			backoff := time.Duration(attempt*attempt) * 5 * time.Second // 20s, 45s
			log.Printf("[download] %s — retry %d/%d in %s (last error: %v)",
				label, attempt, MaxRetries, backoff, lastErr)
			time.Sleep(backoff)
		}

		log.Printf("[download] %s — attempt %d/%d", label, attempt, MaxRetries)

		hash, dlErr := downloadOnce(url, destPath, label)
		if dlErr != nil {
			lastErr = dlErr
			log.Printf("[download] %s — attempt %d failed: %v", label, attempt, dlErr)
			continue
		}

		log.Printf("[download] %s — complete, SHA256=%s", label, hash)
		return hash, nil
	}
	return "", fmt.Errorf("download failed after %d attempts: %w", MaxRetries, lastErr)
}

// ── connCapturingDialer ───────────────────────────────────────────────────────
// A custom dialer that saves the most-recently-established net.Conn so we
// can call SetReadDeadline on it per-read.
// Thread-safe: the HTTP transport may dial on multiple goroutines.

type connCapturingDialer struct {
	base net.Dialer
	mu   sync.Mutex
	conn net.Conn
}

func (d *connCapturingDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	c, err := d.base.DialContext(ctx, network, addr)
	if err != nil {
		return nil, err
	}
	d.mu.Lock()
	d.conn = c
	d.mu.Unlock()
	return c, nil
}

func (d *connCapturingDialer) getConn() net.Conn {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.conn
}

// ── downloadOnce ─────────────────────────────────────────────────────────────

func downloadOnce(url, destPath, label string) (string, error) {
	dialer := &connCapturingDialer{
		base: net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		},
	}

	transport := &http.Transport{
		DialContext:        dialer.DialContext,
		DisableCompression: true, // prevent encoding that changes bytes / breaks SHA256
	}
	client := &http.Client{Transport: transport}
	// No global Timeout — we manage idle timeout per-read.

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept-Encoding", "identity")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server returned HTTP %d", resp.StatusCode)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}

	// idleReader extends the read deadline before every read.
	// The conn is retrieved from the dialer — it's the live TCP socket.
	reader := &idleTimeoutReader{
		r:      resp.Body,
		dialer: dialer,
	}

	h := sha256.New()
	written, copyErr := copyWithProgress(io.TeeReader(reader, h), f, label)

	syncErr := f.Sync()
	closeErr := f.Close()

	if copyErr != nil {
		_ = os.Remove(destPath)
		return "", fmt.Errorf("copy: %w", copyErr)
	}
	if syncErr != nil {
		log.Printf("[download] %s — sync warning: %v", label, syncErr)
	}
	if closeErr != nil {
		return "", fmt.Errorf("close: %w", closeErr)
	}

	log.Printf("[download] %s — wrote %d bytes", label, written)
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ── idleTimeoutReader ─────────────────────────────────────────────────────────
// Extends the TCP read deadline before every Read call.
// Active transfers always extend it → they never time out.
// Stalled transfers miss the deadline → fail within IdleTimeout.

type idleTimeoutReader struct {
	r      io.Reader
	dialer *connCapturingDialer
}

func (r *idleTimeoutReader) Read(p []byte) (int, error) {
	if c := r.dialer.getConn(); c != nil {
		_ = c.SetReadDeadline(time.Now().Add(IdleTimeout))
	}
	return r.r.Read(p)
}

// ── copyWithProgress ──────────────────────────────────────────────────────────
// Copies r → w, logging progress every logEveryBytes.

func copyWithProgress(r io.Reader, w io.Writer, label string) (int64, error) {
	buf := make([]byte, 32*1024)
	var total int64
	var nextLog int64 = logEveryBytes

	for {
		n, readErr := r.Read(buf)
		if n > 0 {
			wn, writeErr := w.Write(buf[:n])
			total += int64(wn)
			if writeErr != nil {
				return total, writeErr
			}
			if total >= nextLog {
				log.Printf("[download] %s — %.1f MB", label, float64(total)/1024/1024)
				nextLog = total + logEveryBytes
			}
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			return total, readErr
		}
	}
}
