// Package api provides HTTP client helpers for communicating with the Racko platform.
// The GUI app authenticates using the same X-Agent-ID header as the agent service.
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Client wraps HTTP calls to the Racko platform.
type Client struct {
	platformURL string
	agentID     string
	http        *http.Client
}

// New creates a new API client.
func New(platformURL, agentID string) *Client {
	return &Client{
		platformURL: platformURL,
		agentID:     agentID,
		http:        &http.Client{Timeout: 60 * time.Second},
	}
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SharedFile struct {
	ID                  string   `json:"_id"`
	FileName            string   `json:"fileName"`
	MimeType            string   `json:"mimeType"`
	SizeBytes           int64    `json:"sizeBytes"`
	SourceMachineID     string   `json:"sourceMachineId"`
	SourceMachineName   string   `json:"sourceMachineName"`
	Permission          string   `json:"permission"`
	SharedWithMachineIDs []string `json:"sharedWithMachineIds"`
	CreatedAt           string   `json:"createdAt"`
}

type Machine struct {
	ID   string `json:"_id"`
	Name string `json:"name"`
}

// ─── Machines ─────────────────────────────────────────────────────────────────

// ListMachines returns all machines for this admin account (used to populate VM selector).
func (c *Client) ListMachines() ([]Machine, error) {
	var resp struct {
		Data struct {
			Machines []Machine `json:"machines"`
		} `json:"data"`
	}
	if err := c.getJSON("/api/v1/agent/shared-files/machines-for-app", &resp); err != nil {
		return nil, err
	}
	return resp.Data.Machines, nil
}

// ─── Shared Files ─────────────────────────────────────────────────────────────

// ListInbox returns files shared WITH this machine.
func (c *Client) ListInbox() ([]SharedFile, error) {
	var resp struct {
		Data struct {
			Files []SharedFile `json:"files"`
		} `json:"data"`
	}
	if err := c.getJSON("/api/v1/agent/shared-files/inbox", &resp); err != nil {
		return nil, err
	}
	return resp.Data.Files, nil
}

// ListOutbox returns files uploaded BY this machine.
func (c *Client) ListOutbox() ([]SharedFile, error) {
	var resp struct {
		Data struct {
			Files []SharedFile `json:"files"`
		} `json:"data"`
	}
	if err := c.getJSON("/api/v1/agent/shared-files/outbox", &resp); err != nil {
		return nil, err
	}
	return resp.Data.Files, nil
}

// UploadFile uploads a local file and sets sharing rules.
func (c *Client) UploadFile(
	localPath string,
	permission string,
	sharedWithMachineIDs []string,
) (*SharedFile, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	// File field
	fw, err := mw.CreateFormFile("file", filepath.Base(localPath))
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(fw, f); err != nil {
		return nil, fmt.Errorf("copy file: %w", err)
	}

	// Permission field
	if err := mw.WriteField("permission", permission); err != nil {
		return nil, err
	}

	// Comma-separated machine IDs
	ids := ""
	for i, id := range sharedWithMachineIDs {
		if i > 0 {
			ids += ","
		}
		ids += id
	}
	if err := mw.WriteField("sharedWithMachineIds", ids); err != nil {
		return nil, err
	}
	mw.Close()

	req, err := http.NewRequest(http.MethodPost,
		c.platformURL+"/api/v1/agent/shared-files", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("X-Agent-ID", c.agentID)

	httpResp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upload request: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode >= 400 {
		b, _ := io.ReadAll(httpResp.Body)
		return nil, fmt.Errorf("server error %d: %s", httpResp.StatusCode, string(b))
	}

	var result struct {
		Data struct {
			File SharedFile `json:"file"`
		} `json:"data"`
	}
	if err := json.NewDecoder(httpResp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result.Data.File, nil
}

// DownloadFile downloads a shared file to destDir and returns the local path.
func (c *Client) DownloadFile(fileID, fileName, destDir string) (string, error) {
	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("%s/api/v1/agent/shared-files/%s/download", c.platformURL, fileID), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Agent-ID", c.agentID)

	httpResp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("download request: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode >= 400 {
		b, _ := io.ReadAll(httpResp.Body)
		return "", fmt.Errorf("server error %d: %s", httpResp.StatusCode, string(b))
	}

	destPath := filepath.Join(destDir, fileName)
	out, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("create dest file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, httpResp.Body); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return destPath, nil
}

// UpdateShare updates permission or target VMs for a file.
func (c *Client) UpdateShare(fileID, permission string, sharedWithMachineIDs []string) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"permission":           permission,
		"sharedWithMachineIds": sharedWithMachineIDs,
	})

	req, err := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s/api/v1/agent/shared-files/%s", c.platformURL, fileID),
		bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", c.agentID)

	httpResp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode >= 400 {
		b, _ := io.ReadAll(httpResp.Body)
		return fmt.Errorf("server error %d: %s", httpResp.StatusCode, string(b))
	}
	return nil
}

// DeleteFile deletes a shared file.
func (c *Client) DeleteFile(fileID string) error {
	req, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("%s/api/v1/agent/shared-files/%s", c.platformURL, fileID), nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Agent-ID", c.agentID)

	httpResp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode >= 400 {
		b, _ := io.ReadAll(httpResp.Body)
		return fmt.Errorf("server error %d: %s", httpResp.StatusCode, string(b))
	}
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (c *Client) getJSON(path string, out interface{}) error {
	req, err := http.NewRequest(http.MethodGet, c.platformURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Agent-ID", c.agentID)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server error %d: %s", resp.StatusCode, string(b))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
