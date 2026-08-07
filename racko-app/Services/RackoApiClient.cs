using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
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

    /// <summary>Upload a local file and share it with target VMs.</summary>
    public async Task<SharedFileDto> UploadAsync(
        string   localPath,
        string   permission,
        string[] sharedWithMachineIds)
    {
        await using var stream = File.OpenRead(localPath);
        var fileName  = Path.GetFileName(localPath);
        var mimeType  = GuessMimeType(fileName);

        using var form = new MultipartFormDataContent();

        var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
        form.Add(fileContent, "file", fileName);
        form.Add(new StringContent(permission), "permission");
        form.Add(new StringContent(string.Join(",", sharedWithMachineIds)), "sharedWithMachineIds");

        var response = await _http.PostAsync("/api/v1/agent/shared-files", form);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<ApiFileResponse>(JsonOpts)
            ?? throw new InvalidOperationException("Empty response from server.");
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
