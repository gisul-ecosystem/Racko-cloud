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
            Timeout     = TimeSpan.FromSeconds(3600), // allow large file uploads/downloads
        };
        _http.DefaultRequestHeaders.Add("X-Agent-ID", _agentId);
    }

    // ── Machines ───────────────────────────────────────────────────────────

    /// <summary>
    /// Returns machines in the same group as this VM.
    /// inGroup = false means this machine is not assigned to any group yet.
    /// </summary>
    public async Task<(IReadOnlyList<MachineDto> Machines, bool InGroup)> ListMachinesAsync()
    {
        var resp = await _http.GetFromJsonAsync<ApiListResponse<MachineDto>>(
            "/api/v1/agent/shared-files/machines-for-app", JsonOpts);
        var machines = resp?.Data.Machines ?? [];
        var inGroup  = resp?.Data.InGroup ?? true;
        return (machines, inGroup);
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
    /// Upload a file (or a folder that has been pre-zipped) using a presigned S3 PUT URL.
    ///
    /// <paramref name="localPath"/>       — path to the actual file to upload.
    /// <paramref name="displayFileName"/> — optional override stored in the DB (e.g. "MyFolder.zip").
    /// <paramref name="uploadProgress"/>  — reports bytes PUT to S3 so far (IProgress marshals to UI thread).
    /// <paramref name="ct"/>              — cancellation token; cancels the S3 PUT mid-stream.
    /// </summary>
    public async Task<SharedFileDto> UploadAsync(
        string            localPath,
        string            permission,
        string[]          sharedWithMachineIds,
        string?           displayFileName = null,
        IProgress<long>?  uploadProgress  = null,
        CancellationToken ct              = default)
    {
        var fileName = displayFileName ?? Path.GetFileName(localPath);
        var mimeType = GuessMimeType(fileName);
        var fileInfo = new FileInfo(localPath);

        // ── Step 1: Get presigned PUT URL from core-api ───────────────────
        var requestBody = new
        {
            fileName,
            mimeType,
            sizeBytes           = fileInfo.Length,
            permission,
            sharedWithMachineIds,
        };

        var reqContent = new StringContent(
            JsonSerializer.Serialize(requestBody),
            Encoding.UTF8,
            "application/json");

        var urlResp = await _http.PostAsync(
            "/api/v1/agent/shared-files/upload-url", reqContent, ct);
        urlResp.EnsureSuccessStatusCode();

        var urlResult = await urlResp.Content.ReadFromJsonAsync<ApiUploadUrlResponse>(JsonOpts, ct)
            ?? throw new InvalidOperationException("Empty upload-url response.");

        var presignedUrl = urlResult.Data.PresignedUrl;
        var pendingId    = urlResult.Data.PendingId;

        // ── Step 2: PUT file DIRECTLY to S3 — bytes never pass through core-api ──
        using var s3Client    = new HttpClient();
        await using var rawFs = File.OpenRead(localPath);

        // Wrap in ProgressStream so every chunk read by HttpClient fires the callback.
        Stream uploadStream = uploadProgress is not null
            ? new ProgressStream(rawFs, uploadProgress)
            : rawFs;

        await using (uploadStream)
        {
            using var fileContent = new StreamContent(uploadStream);
            fileContent.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue(mimeType);
            fileContent.Headers.ContentLength = fileInfo.Length;

            var putResp = await s3Client.PutAsync(presignedUrl, fileContent, ct);
            putResp.EnsureSuccessStatusCode();
        }

        // ── Step 3: Finalize — notify core-api the upload completed ───────
        var completeBody = new StringContent(
            JsonSerializer.Serialize(new { pendingId }),
            Encoding.UTF8,
            "application/json");

        var completeResp = await _http.PostAsync(
            "/api/v1/agent/shared-files/upload-complete", completeBody, ct);
        completeResp.EnsureSuccessStatusCode();

        var result = await completeResp.Content.ReadFromJsonAsync<ApiFileResponse>(JsonOpts, ct)
            ?? throw new InvalidOperationException("Empty upload-complete response.");
        return result.Data.File;
    }

    /// <summary>
    /// Download a shared file to the specified directory with progress reporting.
    ///
    /// <paramref name="downloadProgress"/> — reports bytes received so far.
    /// <paramref name="totalBytes"/>        — expected file size for percentage calculation;
    ///                                        pass 0 if unknown (bar will show indeterminate).
    /// </summary>
    public async Task<string> DownloadAsync(
        string            fileId,
        string            fileName,
        string            destDir,
        long              totalBytes       = 0,
        IProgress<long>?  downloadProgress = null,
        CancellationToken ct               = default)
    {
        var response = await _http.GetAsync(
            $"/api/v1/agent/shared-files/{fileId}/download",
            HttpCompletionOption.ResponseHeadersRead,
            ct);
        response.EnsureSuccessStatusCode();

        Directory.CreateDirectory(destDir);
        var destPath = Path.Combine(destDir, fileName);

        await using var responseStream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileOut        = File.Create(destPath);

        if (downloadProgress is not null)
        {
            await using var tracked = new ProgressStream(fileOut, downloadProgress);
            await responseStream.CopyToAsync(tracked, ct);
        }
        else
        {
            await responseStream.CopyToAsync(fileOut, ct);
        }

        return destPath;
    }

    /// <summary>
    /// Gets a presigned S3 GET URL for the file.
    /// read permission  → 60 s TTL  (viewer only, never saved)
    /// full permission  → 300 s TTL (download directly from S3)
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
        var payload = new { permission, sharedWithMachineIds };
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
