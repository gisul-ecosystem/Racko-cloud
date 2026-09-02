using System.IO;

namespace RackoApp.Services;

/// <summary>
/// A pass-through Stream wrapper that fires a progress callback on every read or write.
/// Used to track S3 upload (wraps the file read stream) and download (wraps the response stream).
///
/// Thread-safe: the callback is invoked on whatever thread reads/writes the stream,
/// but IProgress&lt;T&gt; marshals it to the UI thread via SynchronizationContext automatically.
/// </summary>
public sealed class ProgressStream : Stream
{
    private readonly Stream          _inner;
    private readonly IProgress<long> _progress;
    private          long            _bytesTransferred;

    public ProgressStream(Stream inner, IProgress<long> progress)
    {
        _inner    = inner ?? throw new ArgumentNullException(nameof(inner));
        _progress = progress ?? throw new ArgumentNullException(nameof(progress));
    }

    // ── Stream plumbing ────────────────────────────────────────────────────

    public override bool CanRead  => _inner.CanRead;
    public override bool CanSeek  => _inner.CanSeek;
    public override bool CanWrite => _inner.CanWrite;
    public override long Length   => _inner.Length;

    public override long Position
    {
        get => _inner.Position;
        set => _inner.Position = value;
    }

    public override void Flush() => _inner.Flush();

    public override long Seek(long offset, SeekOrigin origin) =>
        _inner.Seek(offset, origin);

    public override void SetLength(long value) =>
        _inner.SetLength(value);

    // ── Read — used when HttpClient reads the file to PUT to S3 ───────────

    public override int Read(byte[] buffer, int offset, int count)
    {
        var n = _inner.Read(buffer, offset, count);
        if (n > 0) Report(n);
        return n;
    }

    public override async Task<int> ReadAsync(
        byte[] buffer, int offset, int count, CancellationToken ct)
    {
        var n = await _inner.ReadAsync(buffer, offset, count, ct).ConfigureAwait(false);
        if (n > 0) Report(n);
        return n;
    }

    public override async ValueTask<int> ReadAsync(
        Memory<byte> buffer, CancellationToken ct = default)
    {
        var n = await _inner.ReadAsync(buffer, ct).ConfigureAwait(false);
        if (n > 0) Report(n);
        return n;
    }

    // ── Write — used when writing download bytes to disk ──────────────────

    public override void Write(byte[] buffer, int offset, int count)
    {
        _inner.Write(buffer, offset, count);
        Report(count);
    }

    public override async Task WriteAsync(
        byte[] buffer, int offset, int count, CancellationToken ct)
    {
        await _inner.WriteAsync(buffer, offset, count, ct).ConfigureAwait(false);
        Report(count);
    }

    public override async ValueTask WriteAsync(
        ReadOnlyMemory<byte> buffer, CancellationToken ct = default)
    {
        await _inner.WriteAsync(buffer, ct).ConfigureAwait(false);
        Report(buffer.Length);
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private void Report(int bytes)
    {
        _bytesTransferred += bytes;
        _progress.Report(_bytesTransferred);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }
}
