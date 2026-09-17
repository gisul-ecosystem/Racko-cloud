using System.Drawing;
using System.Windows.Forms;

namespace RackoApp.Views;

/// <summary>
/// A modal (non-blocking Show) progress dialog used during upload and download operations.
///
/// Usage pattern:
///   using var dlg = new ProgressForm("Uploading report.pdf");
///   dlg.Show(owner);
///   // ... async work ...
///   dlg.SetPhase("Uploading…");
///   dlg.SetProgress(bytesTransferred, totalBytes);   // updates bar + labels
///   // ...
///   dlg.MarkComplete("Upload complete.");
///
/// The dialog cannot be closed by the user while work is in progress.
/// Cancellation is surfaced via the CancellationToken property.
/// </summary>
public sealed class ProgressForm : Form
{
    // ── Brand colours (match MainForm) ─────────────────────────────────────
    private static readonly Color Brand      = Color.FromArgb(185, 28, 28);
    private static readonly Color BrandLight = Color.FromArgb(254, 242, 242);
    private static readonly Color Surface    = Color.FromArgb(248, 250, 252);
    private static readonly Color TextMain   = Color.FromArgb(15,  23,  42);
    private static readonly Color TextMute   = Color.FromArgb(100, 116, 139);
    private static readonly Color Border     = Color.FromArgb(226, 232, 240);

    // ── Controls ──────────────────────────────────────────────────────────
    private readonly Label       _titleLabel;
    private readonly Label       _phaseLabel;
    private readonly ProgressBar _bar;
    private readonly Label       _percentLabel;
    private readonly Label       _bytesLabel;
    private readonly Button      _cancelBtn;

    // ── Cancellation ──────────────────────────────────────────────────────
    private readonly CancellationTokenSource _cts = new();

    /// <summary>Pass this token to all async operations so Cancel works.</summary>
    public CancellationToken CancellationToken => _cts.Token;

    // ── State ─────────────────────────────────────────────────────────────
    private bool _completed;

    // ── Speed tracking ────────────────────────────────────────────────────
    private long     _lastBytes;
    private DateTime _lastTick = DateTime.UtcNow;
    private double   _smoothedBytesPerSec; // exponential moving average

    // ── Constructor ───────────────────────────────────────────────────────

    public ProgressForm(string title)
    {
        // ── Form chrome ───────────────────────────────────────────────────
        Text            = "Racko — " + title;
        Size            = new Size(480, 210);
        MinimumSize     = new Size(480, 210);
        MaximumSize     = new Size(800, 210);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        StartPosition   = FormStartPosition.CenterParent;
        BackColor       = Surface;
        Font            = new Font("Segoe UI", 9f);

        // ── Title ─────────────────────────────────────────────────────────
        _titleLabel = new Label
        {
            Text      = title,
            Left      = 20,
            Top       = 18,
            Width     = 440,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = TextMain,
        };

        // ── Phase label ───────────────────────────────────────────────────
        _phaseLabel = new Label
        {
            Text      = "Preparing…",
            Left      = 20,
            Top       = 46,
            Width     = 440,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 9f),
            ForeColor = TextMute,
        };

        // ── Progress bar ──────────────────────────────────────────────────
        _bar = new ProgressBar
        {
            Left    = 20,
            Top     = 72,
            Width   = 440,
            Height  = 18,
            Minimum = 0,
            Maximum = 1000,   // use 1000 steps for smooth sub-percent motion
            Style   = ProgressBarStyle.Continuous,
        };

        // ── Percentage label (right-aligned beside bar) ───────────────────
        _percentLabel = new Label
        {
            Text      = "0%",
            Left      = 20,
            Top       = 96,
            Width     = 100,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = Brand,
        };

        // ── Bytes / speed label ───────────────────────────────────────────
        _bytesLabel = new Label
        {
            Text      = "",
            Left      = 120,
            Top       = 96,
            Width     = 340,
            AutoSize  = false,
            TextAlign = ContentAlignment.MiddleRight,
            Font      = new Font("Segoe UI", 8.5f),
            ForeColor = TextMute,
        };

        // ── Cancel button ─────────────────────────────────────────────────
        _cancelBtn = new Button
        {
            Text      = "Cancel",
            Left      = 355,
            Top       = 128,
            Width     = 105,
            Height    = 30,
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            BackColor = Color.White,
            ForeColor = Color.FromArgb(55, 65, 81),
            Cursor    = Cursors.Hand,
        };
        _cancelBtn.FlatAppearance.BorderColor = Border;
        _cancelBtn.Click += OnCancelClick;

        // ── Separator line ────────────────────────────────────────────────
        var separator = new Panel
        {
            Left      = 0,
            Top       = 122,
            Width     = 480,
            Height    = 1,
            BackColor = Border,
        };

        Controls.AddRange(new Control[]
        {
            _titleLabel, _phaseLabel,
            _bar, _percentLabel, _bytesLabel,
            separator, _cancelBtn,
        });

        // Prevent closing while in progress
        FormClosing += OnFormClosing;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /// <summary>Update the phase label (e.g. "Zipping…", "Uploading…", "Extracting…").</summary>
    public void SetPhase(string phase)
    {
        if (InvokeRequired) { BeginInvoke(() => SetPhase(phase)); return; }
        _phaseLabel.Text = phase;
    }

    /// <summary>
    /// Update the progress bar, percentage, and bytes/speed labels.
    /// <paramref name="done"/> and <paramref name="total"/> are in bytes.
    /// If <paramref name="total"/> is 0 the bar shows a marquee-style indeterminate state.
    /// </summary>
    public void SetProgress(long done, long total)
    {
        if (InvokeRequired) { BeginInvoke(() => SetProgress(done, total)); return; }

        if (total <= 0)
        {
            _bar.Style        = ProgressBarStyle.Marquee;
            _percentLabel.Text = "—";
            _bytesLabel.Text   = FormatBytes(done);
            return;
        }

        _bar.Style = ProgressBarStyle.Continuous;

        double pct   = Math.Clamp((double)done / total, 0, 1);
        int    steps = (int)(pct * 1000);

        // WinForms ProgressBar has a known rendering bug where it lags 1 step behind.
        // Setting it to steps+1 then back to steps works around it.
        if (steps < 1000) { _bar.Value = steps + 1; }
        _bar.Value = steps;

        _percentLabel.Text = $"{pct * 100:F0}%";
        _bytesLabel.Text   = $"{FormatBytes(done)} / {FormatBytes(total)}{SpeedLabel(done)}";
    }

    /// <summary>
    /// Show a final "completed" state and enable the close button.
    /// Call this after all work finishes — the dialog stays open until the user dismisses it
    /// or you call Close() from the caller (the normal pattern is to just Close() it yourself).
    /// </summary>
    public void MarkComplete(string message = "Done.")
    {
        if (InvokeRequired) { BeginInvoke(() => MarkComplete(message)); return; }

        _completed         = true;
        _bar.Value         = 1000;
        _bar.Style         = ProgressBarStyle.Continuous;
        _phaseLabel.Text   = message;
        _phaseLabel.ForeColor = Color.FromArgb(22, 163, 74); // green
        _percentLabel.Text = "100%";
        _cancelBtn.Text    = "Close";
        _cancelBtn.BackColor = BrandLight;
        _cancelBtn.ForeColor = Brand;
        _cancelBtn.FlatAppearance.BorderColor = Color.FromArgb(252, 165, 165);
    }

    /// <summary>Show an error state. The form stays open for the user to dismiss.</summary>
    public void MarkError(string message)
    {
        if (InvokeRequired) { BeginInvoke(() => MarkError(message)); return; }

        _completed         = true;
        _bar.Style         = ProgressBarStyle.Continuous;
        _phaseLabel.Text   = message;
        _phaseLabel.ForeColor = Color.FromArgb(220, 38, 38);
        _cancelBtn.Text    = "Close";
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private void OnCancelClick(object? s, EventArgs e)
    {
        if (!_completed)
        {
            _cancelBtn.Enabled = false;
            _phaseLabel.Text   = "Cancelling…";
            _phaseLabel.ForeColor = TextMute;
            _cts.Cancel();
        }
        else
        {
            Close();
        }
    }

    private void OnFormClosing(object? s, FormClosingEventArgs e)
    {
        // Block Alt+F4 / X button while work is running
        if (!_completed && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
        }
    }

    /// <summary>
    /// Exponential moving average speed (α = 0.3) to smooth out burst variance.
    /// Returns an empty string if not enough time has passed.
    /// </summary>
    private string SpeedLabel(long currentBytes)
    {
        var now     = DateTime.UtcNow;
        var elapsed = (now - _lastTick).TotalSeconds;

        if (elapsed < 0.25) return _smoothedBytesPerSec > 0
            ? $"  •  {FormatBytes((long)_smoothedBytesPerSec)}/s"
            : "";

        var instantRate = (currentBytes - _lastBytes) / elapsed;
        _smoothedBytesPerSec = _smoothedBytesPerSec < 1
            ? instantRate
            : 0.3 * instantRate + 0.7 * _smoothedBytesPerSec;

        _lastBytes = currentBytes;
        _lastTick  = now;

        return _smoothedBytesPerSec > 0
            ? $"  •  {FormatBytes((long)_smoothedBytesPerSec)}/s"
            : "";
    }

    private static string FormatBytes(long bytes) => bytes switch
    {
        >= 1_073_741_824 => $"{bytes / 1_073_741_824.0:F1} GB",
        >= 1_048_576     => $"{bytes / 1_048_576.0:F1} MB",
        >= 1_024         => $"{bytes / 1_024.0:F1} KB",
        _                => $"{bytes} B",
    };

    protected override void Dispose(bool disposing)
    {
        if (disposing) _cts.Dispose();
        base.Dispose(disposing);
    }
}
