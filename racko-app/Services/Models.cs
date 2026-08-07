using System.Text.Json.Serialization;

namespace RackoApp.Services;

public record MachineDto(
    [property: JsonPropertyName("_id")]  string Id,
    [property: JsonPropertyName("name")] string Name
);

public record SharedFileDto(
    [property: JsonPropertyName("_id")]                  string   Id,
    [property: JsonPropertyName("fileName")]             string   FileName,
    [property: JsonPropertyName("mimeType")]             string   MimeType,
    [property: JsonPropertyName("sizeBytes")]            long     SizeBytes,
    [property: JsonPropertyName("sourceMachineId")]      string   SourceMachineId,
    [property: JsonPropertyName("sourceMachineName")]    string   SourceMachineName,
    [property: JsonPropertyName("permission")]           string   Permission,
    [property: JsonPropertyName("sharedWithMachineIds")] string[] SharedWithMachineIds,
    [property: JsonPropertyName("createdAt")]            string   CreatedAt
)
{
    /// <summary>Human-readable permission label for display.</summary>
    public string PermissionLabel => Permission switch
    {
        "read-write" => "Read & Write",
        "full"       => "Full Control",
        _            => "Read Only",
    };

    /// <summary>Human-readable file size.</summary>
    public string SizeLabel => SizeBytes switch
    {
        >= 1_073_741_824 => $"{SizeBytes / 1_073_741_824.0:F1} GB",
        >= 1_048_576     => $"{SizeBytes / 1_048_576.0:F1} MB",
        >= 1_024         => $"{SizeBytes / 1_024.0:F1} KB",
        _                => $"{SizeBytes} B",
    };
}

public record ApiListResponse<T>(
    [property: JsonPropertyName("data")] ApiListData<T> Data
);

public record ApiListData<T>(
    [property: JsonPropertyName("files")]    IReadOnlyList<T>? Files,
    [property: JsonPropertyName("machines")] IReadOnlyList<T>? Machines,
    [property: JsonPropertyName("total")]    int               Total
);

public record ApiFileResponse(
    [property: JsonPropertyName("data")] ApiFileData Data
);

public record ApiFileData(
    [property: JsonPropertyName("file")] SharedFileDto File
);

public record ViewUrlResponse(
    [property: JsonPropertyName("presignedUrl")] string PresignedUrl,
    [property: JsonPropertyName("permission")]   string Permission,
    [property: JsonPropertyName("fileName")]     string FileName,
    [property: JsonPropertyName("expiresIn")]    int    ExpiresIn
);

public record ApiViewUrlResponse(
    [property: JsonPropertyName("data")] ViewUrlResponse Data
);

public record UploadUrlResponse(
    [property: JsonPropertyName("presignedUrl")] string PresignedUrl,
    [property: JsonPropertyName("storageRef")]   string StorageRef,
    [property: JsonPropertyName("pendingId")]    string PendingId,
    [property: JsonPropertyName("expiresIn")]    int    ExpiresIn
);

public record ApiUploadUrlResponse(
    [property: JsonPropertyName("data")] UploadUrlResponse Data
);
