using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace RackoApp.Services;

/// <summary>
/// HTTP client that talks to the Racko platform using X-Agent-ID auth —
/// exactly the same auth mechanism as the Go agent service.
/// </summary>
public class RackoApiClient
{
    private readonly HttpClient _http;
    private readonly string     _agentId;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public RackoApiClient(AgentConfig config)
    {
        _agentId = config.AgentId;
        _http    = new HttpClient
        {
            BaseAddress = new Uri(config.PlatformUrl),
            Timeout     = TimeSpan.FromSeconds(120),
        };
        _http.DefaultRequestHeaders.Add("X-Agent-ID", _agentId);
    }

    // ── Machines ───────────────────────────────────────────────────────────

    /// <summary>Returns all other VMs for the same admin account (VM selector).</summary>
    public async Task<IReadOnlyList<MachineDto>> ListMachinesAsync()
    {
        var resp = await _http.GetFromJsonAsync<ApiListResponse<MachineDto>>(
            "/api/v1/agent/shared-files/machines-for-app", JsonOpts);
        return resp?.Data.Machines ?? [];
    }

    // ── Shared Files ───────────────────────────────────────────────────────

    /// <summary>Files shared WITH this machine (inbox).</summary>
    public async Task<IReadOnlyList<SharedFileDto>> ListInboxAsync()
    {
        var resp = await _http.GetFromJsonAsync<ApiListResponse<SharedFileDto>>(
            "/api/v1/agent/shared-files/inbox", JsonOpts);
        return resp?.Data.Files ?? [];
    }

    /// <summary>Files uploaded BY this machine (outbox).</summary>
    public async Task<IReadOnlyList<SharedFileDto>> ListOutboxAsync()
    {
        var resp = await _http.GetFromJsonAsync<ApiListResponse<SharedFileDto>>(
            "/api/v1/agent/shared-files/outbox", JsonOpts);
        return resp?.Data.Files ?? [];
    }

    /// <summary>
    /// Upload a file using presigned S3 PUT URL — zero server memory usage.
    /// Step 1: Get presigned URL + pendingId from core-api (no file bytes sent).
    /// Step 2: PUT file directly to S3 using the presigned URL.
    /// Step 3: Notify core-api that upload completed (pendingId).
    /// </summary>
    public async Task<SharedFileDto> UploadAsync(
        string   localPath,
        string   permission,
        string[] sharedWithMachineIds)
    {
        var fileName = Path.GetFileName(localPath);
        var mimeType = GuessMimeType(fileName);
        var fileInfo = new FileInfo(localPath);

        // ── Step 1: Get presigned PUT URL from core-api ───────────────────────
        var requestBody = new
        {
            fileName,
            mimeType,
            sizeBytes           = fileInfo.Length,
            permission,
            sharedWithMachineIds,
        };

        var reqContent = new StringContent(
            System.Text.Json.JsonSerializer.Serialize(requestBody),
            System.Text.Encoding.UTF8,
            "application/json");

        var urlResp = await _http.PostAsync("/api/v1/agent/shared-files/upload-url", reqContent);
        urlResp.EnsureSuccessStatusCode();

        var urlResult = await urlResp.Content.ReadFromJsonAsync<ApiUploadUrlResponse>(JsonOpts)
            ?? throw new InvalidOperationException("Empty upload-url response.");

        var presignedUrl = urlResult.Data.PresignedUrl;
        var pendingId    = urlResult.Data.PendingId;

        // ── Step 2: PUT file DIRECTLY to S3 — no bytes through core-api ───────
        using var s3Client  = new System.Net.Http.HttpClient();
        await using var fs  = File.OpenRead(localPath);
        using var fileContent = new StreamContent(fs);
        fileContent.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(mimeType);
        fileContent.Headers.ContentLength = fileInfo.Length;

        var putResp = await s3Client.PutAsync(presignedUrl, fileContent);
        putResp.EnsureSuccessStatusCode();

        // ── Step 3: Finalize — notify core-api the upload completed ───────────
        var completeBody = new StringContent(
            System.Text.Json.JsonSerializer.Serialize(new { pendingId }),
            System.Text.Encoding.UTF8,
            "application/json");

        var completeResp = await _http.PostAsync(
            "/api/v1/agent/shared-files/upload-complete", completeBody);
        completeResp.EnsureSuccessStatusCode();

        var result = await completeResp.Content.ReadFromJsonAsync<ApiFileResponse>(JsonOpts)
            ?? throw new InvalidOperationException("Empty upload-complete response.");
        return result.Data.File;
    }

    /// <summary>Download a shared file to the specified directory.</summary>
    /// <returns>Full path of the saved file.</returns>
    public async Task<string> DownloadAsync(string fileId, string fileName, string destDir)
    {
        var response = await _http.GetAsync(
            $"/api/v1/agent/shared-files/{fileId}/download",
            HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        Directory.CreateDirectory(destDir);
        var destPath = Path.Combine(destDir, fileName);

        await using var fs = File.Create(destPath);
        await response.Content.CopyToAsync(fs);
        return destPath;
    }

    /// <summary>
    /// Gets a presigned S3 GET URL for the file.
    /// read permission  → 60s TTL  (open in viewer, never saved)
    /// full permission  → 300s TTL (download directly from S3, API not involved)
    /// </summary>
    public async Task<ViewUrlResponse> GetViewUrlAsync(string fileId)
    {
        var resp = await _http.GetFromJsonAsync<ApiViewUrlResponse>(
            $"/api/v1/agent/shared-files/{fileId}/view-url", JsonOpts)
            ?? throw new InvalidOperationException("Empty response.");
        return resp.Data;
    }

    /// <summary>Update permission and/or target VMs for a file.</summary>
    public async Task UpdateShareAsync(
        string   fileId,
        string   permission,
        string[] sharedWithMachineIds)
    {
        var payload = new
        {
            permission,
            sharedWithMachineIds,
        };
        var content = new StringContent(
            JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        var response = await _http.PatchAsync(
            $"/api/v1/agent/shared-files/{fileId}", content);
        response.EnsureSuccessStatusCode();
    }

    /// <summary>Delete a shared file.</summary>
    public async Task DeleteAsync(string fileId)
    {
        var response = await _http.DeleteAsync($"/api/v1/agent/shared-files/{fileId}");
        response.EnsureSuccessStatusCode();
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private static string GuessMimeType(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".pdf"  => "application/pdf",
            ".png"  => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif"  => "image/gif",
            ".zip"  => "application/zip",
            ".txt"  => "text/plain",
            ".json" => "application/json",
            ".xml"  => "application/xml",
            ".csv"  => "text/csv",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            _       => "application/octet-stream",
        };
}
