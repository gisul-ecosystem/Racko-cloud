using System.IO;
using System.IO.Compression;

namespace RackoApp.Services;

/// <summary>
/// Progress-aware zip helpers.
///
/// ZipFile.CreateFromDirectory and ZipFile.ExtractToDirectory are black boxes with no
/// progress events. These replacements enumerate entries manually and copy in 64 KB chunks,
/// reporting (bytesProcessed, totalBytes) after each chunk so the UI can show a live bar.
///
/// The progress value is a (long transferred, long total) tuple so callers can derive
/// both a percentage and a human-readable bytes label without extra state.
/// </summary>
public static class ZipProgress
{
    private const int ChunkSize = 64 * 1024; // 64 KB

    // ── Create (zip a folder) ─────────────────────────────────────────────

    /// <summary>
    /// Zip <paramref name="sourceDir"/> into <paramref name="destZipPath"/>.
    /// Reports (bytesWritten, totalBytes) via <paramref name="progress"/> as data is compressed.
    /// </summary>
    public static async Task CreateFromDirectoryAsync(
        string                          sourceDir,
        string                          destZipPath,
        IProgress<(long done, long total)>? progress = null,
        CancellationToken               ct = default)
    {
        // Enumerate all files up-front so we know the total size for the progress bar.
        // EnumerationOptions with IgnoreInaccessible + AttributesToSkip:ReparsePoint ensures
        // that Windows junction points (My Music, My Pictures, etc.) and any locked/protected
        // paths are silently skipped instead of throwing UnauthorizedAccessException.
        var enumOptions = new EnumerationOptions
        {
            IgnoreInaccessible    = true,
            RecurseSubdirectories = true,
            AttributesToSkip      = FileAttributes.ReparsePoint,
        };
        var files = Directory.GetFiles(sourceDir, "*", enumOptions);
        long totalBytes = files.Sum(f => new FileInfo(f).Length);
        long doneBytes  = 0;

        // Use optimal compression for smaller transfers; Fastest would be faster to zip
        // but the file goes straight to S3 so CPU cost > bandwidth cost.
        await using var zipStream = File.Create(destZipPath);
        using  var archive        = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: false);

        var buffer = new byte[ChunkSize];

        foreach (var filePath in files)
        {
            ct.ThrowIfCancellationRequested();

            // Build the relative entry name, preserving folder structure.
            // Use the folder name as the root, same behaviour as ZipFile.CreateFromDirectory
            // with includeBaseDirectory: true.
            var folderName    = Path.GetFileName(sourceDir.TrimEnd(Path.DirectorySeparatorChar,
                                                                    Path.AltDirectorySeparatorChar));
            var relativePath  = Path.GetRelativePath(Path.GetDirectoryName(sourceDir)!, filePath);
            var entryName     = relativePath.Replace(Path.DirectorySeparatorChar, '/');

            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);

            await using var fileIn  = File.OpenRead(filePath);
            await using var entryOut = entry.Open();

            int bytesRead;
            while ((bytesRead = await fileIn.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
            {
                ct.ThrowIfCancellationRequested();
                await entryOut.WriteAsync(buffer.AsMemory(0, bytesRead), ct).ConfigureAwait(false);
                doneBytes += bytesRead;
                progress?.Report((doneBytes, totalBytes));
            }
        }
    }

    // ── Extract (unzip a folder) ──────────────────────────────────────────

    /// <summary>
    /// Extract <paramref name="zipPath"/> into <paramref name="destDir"/>.
    /// Reports (bytesExtracted, totalBytes) via <paramref name="progress"/>.
    /// Existing files are overwritten.
    /// </summary>
    public static async Task ExtractToDirectoryAsync(
        string                          zipPath,
        string                          destDir,
        IProgress<(long done, long total)>? progress = null,
        CancellationToken               ct = default)
    {
        Directory.CreateDirectory(destDir);

        await using var zipStream = File.OpenRead(zipPath);
        using  var archive        = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: false);

        // Total uncompressed bytes so the bar is byte-accurate, not entry-count-accurate.
        long totalBytes = archive.Entries.Sum(e => e.Length);
        long doneBytes  = 0;

        var buffer = new byte[ChunkSize];

        foreach (var entry in archive.Entries)
        {
            ct.ThrowIfCancellationRequested();

            // Skip directory-only entries (Length == 0 with trailing slash)
            if (string.IsNullOrEmpty(entry.Name)) continue;

            var destPath = Path.GetFullPath(Path.Combine(destDir, entry.FullName));

            // Path traversal guard — ensure the destination is inside destDir
            if (!destPath.StartsWith(Path.GetFullPath(destDir) + Path.DirectorySeparatorChar,
                                     StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException(
                    $"Zip entry '{entry.FullName}' would extract outside the destination directory.");
            }

            Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);

            await using var entryIn = entry.Open();
            await using var fileOut = File.Create(destPath);

            int bytesRead;
            while ((bytesRead = await entryIn.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
            {
                ct.ThrowIfCancellationRequested();
                await fileOut.WriteAsync(buffer.AsMemory(0, bytesRead), ct).ConfigureAwait(false);
                doneBytes += bytesRead;
                progress?.Report((doneBytes, totalBytes));
            }
        }
    }
}
