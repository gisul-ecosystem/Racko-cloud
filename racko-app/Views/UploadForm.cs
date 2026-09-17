using System.Drawing;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp.Views;

/// <summary>
/// File / folder picker dialog.
///
/// Folder zipping is performed here (before DialogResult.OK) with an inline
/// progress bar so the user can see zip progress.  The heavy upload+S3 work
/// happens in MainForm after the dialog closes, where ProgressForm is shown.
/// </summary>
public class UploadForm : Form
{
    // ── Outputs read by MainForm after DialogResult.OK ─────────────────────
    public IReadOnlyList<UploadEntry> SelectedEntries  { get; private set; } = [];
    public string                     SelectedPermission { get; private set; } = "read";
    public string[]                   SelectedMachineIds { get; private set; } = [];

    private readonly IReadOnlyList<MachineDto> _machines;

    // Key = display name, Value = actual path (file or folder)
    private readonly List<(string DisplayName, string ActualPath)> _pendingPaths = [];

    // ── Controls ──────────────────────────────────────────────────────────
    private ListBox        _fileList     = null!;
    private Button         _removeBtn    = null!;
    private RadioButton    _rbRead       = null!;
    private RadioButton    _rbFull       = null!;
    private CheckedListBox _vmList       = null!;
    private Button         _uploadBtn    = null!;
    private CheckBox       _selectAllChk = null!;
    private Label          _fileCountLbl = null!;

    // ── Zip progress panel (hidden until folders are zipped) ──────────────
    private Panel       _zipPanel    = null!;
    private Label       _zipLabel    = null!;
    private ProgressBar _zipBar      = null!;
    private Label       _zipPctLabel = null!;
    private Label       _zipBytesLbl = null!;

    // ── Brand colours ──────────────────────────────────────────────────────
    private static readonly Color Brand    = Color.FromArgb(185, 28, 28);
    private static readonly Color Surface  = Color.FromArgb(248, 250, 252);
    private static readonly Color TextMain = Color.FromArgb(15,  23,  42);
    private static readonly Color TextMute = Color.FromArgb(100, 116, 139);
    private static readonly Color Border   = Color.FromArgb(226, 232, 240);

    public UploadForm(IReadOnlyList<MachineDto> machines)
    {
        _machines = machines;
        BuildUI();
    }

    // ── Build UI ───────────────────────────────────────────────────────────

    private void BuildUI()
    {
        Text            = "Upload & Share Files";
        Size            = new Size(480, 620);
        MinimumSize     = new Size(460, 600);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        StartPosition   = FormStartPosition.CenterParent;
        BackColor       = Surface;
        Font            = new Font("Segoe UI", 9f);

        var pad = 20;
        var y   = pad;

        // ── Title ─────────────────────────────────────────────────────────
        AddLabel("Upload & Share Files", pad, ref y, bold: true, size: 12f);
        y += 6;

        // ── File picker row ───────────────────────────────────────────────
        AddLabel("Files or Folders", pad, ref y);

        var fileRow = new Panel
        {
            Left   = pad,
            Top    = y,
            Width  = ClientSize.Width - pad * 2,
            Height = 30,
        };

        _fileCountLbl = new Label
        {
            Text      = "No files selected",
            ForeColor = TextMute,
            AutoSize  = false,
            Width     = fileRow.Width - 220,
            Height    = 30,
            Left      = 0,
            Top       = 0,
            TextAlign = ContentAlignment.MiddleLeft,
        };

        var browseFolderBtn = MakeButton("📁 Add Folder", secondary: true);
        browseFolderBtn.Left   = fileRow.Width - 220;
        browseFolderBtn.Top    = 0;
        browseFolderBtn.Width  = 110;
        browseFolderBtn.Height = 28;
        browseFolderBtn.Click += OnBrowseFolderClick;

        var browseBtn = MakeButton("📄 Add Files", secondary: true);
        browseBtn.Left   = fileRow.Width - 100;
        browseBtn.Top    = 0;
        browseBtn.Width  = 100;
        browseBtn.Height = 28;
        browseBtn.Click += OnBrowseClick;

        fileRow.Controls.AddRange(new Control[] { _fileCountLbl, browseFolderBtn, browseBtn });
        Controls.Add(fileRow);
        y += 36;

        // ── Selected files list ───────────────────────────────────────────
        _fileList = new ListBox
        {
            Left          = pad,
            Top           = y,
            Width         = ClientSize.Width - pad * 2,
            Height        = 90,
            BorderStyle   = BorderStyle.FixedSingle,
            Font          = new Font("Segoe UI", 8.5f),
            SelectionMode = SelectionMode.MultiExtended,
        };
        Controls.Add(_fileList);
        y += 94;

        _removeBtn = MakeButton("✕ Remove Selected", secondary: true);
        _removeBtn.Left    = pad;
        _removeBtn.Top     = y;
        _removeBtn.Width   = 140;
        _removeBtn.Height  = 24;
        _removeBtn.Font    = new Font("Segoe UI", 8f);
        _removeBtn.Enabled = false;
        _removeBtn.Click  += OnRemoveClick;
        Controls.Add(_removeBtn);
        _fileList.SelectedIndexChanged += (_, _) =>
            _removeBtn.Enabled = _fileList.SelectedIndices.Count > 0;
        y += 30;

        // ── Permission ────────────────────────────────────────────────────
        AddLabel("Permission", pad, ref y);
        _rbRead = new RadioButton { Text = "Read Only",    Checked = true, Left = pad,       Top = y, AutoSize = true };
        _rbFull = new RadioButton { Text = "Full Control", Left = pad + 130,                 Top = y, AutoSize = true };
        Controls.AddRange(new Control[] { _rbRead, _rbFull });
        y += 30;

        // ── VM list ───────────────────────────────────────────────────────
        var vmLabel = new Label
        {
            Text      = "Share with VMs",
            Left      = pad,
            Top       = y,
            AutoSize  = true,
            Font      = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = TextMain,
        };
        Controls.Add(vmLabel);

        _selectAllChk = new CheckBox
        {
            Text       = "Select All",
            Appearance = Appearance.Button,
            FlatStyle  = FlatStyle.Flat,
            Font       = new Font("Segoe UI", 8f),
            AutoSize   = true,
            Left       = pad + vmLabel.PreferredWidth + 12,
            Top        = y - 1,
            Cursor     = Cursors.Hand,
            BackColor  = Color.White,
            ForeColor  = Brand,
        };
        _selectAllChk.FlatAppearance.BorderColor      = Brand;
        _selectAllChk.FlatAppearance.CheckedBackColor = Color.FromArgb(254, 242, 242);
        _selectAllChk.CheckedChanged += OnSelectAllCheckChanged;
        Controls.Add(_selectAllChk);
        y += vmLabel.PreferredHeight + 8;

        _vmList = new CheckedListBox
        {
            Left         = pad,
            Top          = y,
            Width        = ClientSize.Width - pad * 2,
            Height       = 110,
            CheckOnClick = true,
            BorderStyle  = BorderStyle.FixedSingle,
            Font         = new Font("Segoe UI", 9f),
        };
        if (_machines.Count == 0)
            _vmList.Items.Add("No other VMs found on your account.");
        else
            foreach (var m in _machines)
                _vmList.Items.Add(m.Name);

        _vmList.ItemCheck += (_, _) => UpdateSelectAllLabel();
        Controls.Add(_vmList);
        y += 118;

        // ── Zip progress panel (initially hidden) ─────────────────────────
        _zipPanel = new Panel
        {
            Left      = pad,
            Top       = y,
            Width     = ClientSize.Width - pad * 2,
            Height    = 62,
            Visible   = false,
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
        };

        _zipLabel = new Label
        {
            Left      = 8,
            Top       = 6,
            Width     = _zipPanel.Width - 16,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 8.5f),
            ForeColor = TextMain,
            Text      = "Zipping…",
        };

        _zipBar = new ProgressBar
        {
            Left    = 8,
            Top     = 24,
            Width   = _zipPanel.Width - 16,
            Height  = 14,
            Minimum = 0,
            Maximum = 1000,
            Style   = ProgressBarStyle.Continuous,
        };

        _zipPctLabel = new Label
        {
            Left      = 8,
            Top       = 42,
            Width     = 60,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 8f, FontStyle.Bold),
            ForeColor = Brand,
            Text      = "0%",
        };

        _zipBytesLbl = new Label
        {
            Left      = 68,
            Top       = 42,
            Width     = _zipPanel.Width - 76,
            AutoSize  = false,
            TextAlign = ContentAlignment.MiddleRight,
            Font      = new Font("Segoe UI", 8f),
            ForeColor = TextMute,
            Text      = "",
        };

        _zipPanel.Controls.AddRange(new Control[]
            { _zipLabel, _zipBar, _zipPctLabel, _zipBytesLbl });
        Controls.Add(_zipPanel);
        y += 68;

        // ── Footer ────────────────────────────────────────────────────────
        var cancelBtn = MakeButton("Cancel", secondary: true);
        cancelBtn.Left   = ClientSize.Width - pad - 200;
        cancelBtn.Top    = y + 6;
        cancelBtn.Width  = 90;
        cancelBtn.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        _uploadBtn         = MakeButton("Upload", secondary: false);
        _uploadBtn.Left    = ClientSize.Width - pad - 100;
        _uploadBtn.Top     = y + 6;
        _uploadBtn.Width   = 90;
        _uploadBtn.Enabled = false;
        _uploadBtn.Click  += OnUploadClickAsync;

        Controls.AddRange(new Control[] { cancelBtn, _uploadBtn });
    }

    // ── Browse ─────────────────────────────────────────────────────────────

    private void OnBrowseClick(object? s, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title            = "Select files to share",
            Filter           = "All Files (*.*)|*.*",
            Multiselect      = true,
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        foreach (var path in dlg.FileNames)
        {
            var name = Path.GetFileName(path);
            if (!_pendingPaths.Any(p => p.ActualPath == path))
            {
                _pendingPaths.Add((name, path));
                _fileList.Items.Add(name);
            }
        }
        RefreshFileCount();
    }

    private void OnBrowseFolderClick(object? s, EventArgs e)
    {
        using var dlg = new FolderBrowserDialog
        {
            Description            = "Select a folder to share",
            UseDescriptionForTitle = true,
            ShowNewFolderButton    = false,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        var folderPath  = dlg.SelectedPath;
        var folderName  = Path.GetFileName(folderPath);
        var displayName = $"📁 {folderName}";

        if (!_pendingPaths.Any(p => p.ActualPath == folderPath))
        {
            _pendingPaths.Add((displayName, folderPath));
            _fileList.Items.Add(displayName);
        }
        RefreshFileCount();
    }

    private void OnRemoveClick(object? s, EventArgs e)
    {
        var indices = _fileList.SelectedIndices.Cast<int>()
                               .OrderByDescending(i => i)
                               .ToList();
        foreach (var i in indices)
        {
            _pendingPaths.RemoveAt(i);
            _fileList.Items.RemoveAt(i);
        }
        RefreshFileCount();
    }

    private void RefreshFileCount()
    {
        int n = _pendingPaths.Count;
        _fileCountLbl.Text      = n == 0 ? "No files selected" : $"{n} item{(n != 1 ? "s" : "")} selected";
        _fileCountLbl.ForeColor = n == 0 ? TextMute : TextMain;
        _uploadBtn.Enabled      = n > 0;
    }

    // ── Select All ─────────────────────────────────────────────────────────

    private void OnSelectAllCheckChanged(object? s, EventArgs e)
    {
        if (_machines.Count == 0) return;
        bool target = _selectAllChk.Checked;
        for (int i = 0; i < _vmList.Items.Count; i++)
            _vmList.SetItemChecked(i, target);
        _selectAllChk.Text = target ? "Deselect All" : "Select All";
    }

    private void UpdateSelectAllLabel()
    {
        if (_machines.Count == 0) return;
        BeginInvoke(() =>
        {
            bool allChecked = _vmList.CheckedIndices.Count == _vmList.Items.Count;
            _selectAllChk.Checked = allChecked;
            _selectAllChk.Text    = allChecked ? "Deselect All" : "Select All";
        });
    }

    // ── Upload click ────────────────────────────────────────────────────────

    private async void OnUploadClickAsync(object? s, EventArgs e)
    {
        if (_pendingPaths.Count == 0) return;

        SelectedPermission = _rbFull.Checked ? "full" : "read";

        // Validate VM selection
        if (_machines.Count > 0)
        {
            var ids = new List<string>();
            for (int i = 0; i < _vmList.CheckedIndices.Count; i++)
                ids.Add(_machines[_vmList.CheckedIndices[i]].Id);

            if (ids.Count == 0)
            {
                MessageBox.Show("Please select at least one VM to share with.",
                    "Racko", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            SelectedMachineIds = [.. ids];
        }

        // ── Plain files only — no zipping needed ───────────────────────────
        var folders = _pendingPaths.Where(p => Directory.Exists(p.ActualPath)).ToList();
        if (folders.Count == 0)
        {
            SelectedEntries = _pendingPaths
                .Select(p => new UploadEntry(p.ActualPath, Path.GetFileName(p.ActualPath), null))
                .ToList();
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        // ── One or more folders — zip with inline progress bar ─────────────
        SetFormEnabled(false);
        _zipPanel.Visible = true;

        var entries = new List<UploadEntry>();
        var cts     = new CancellationTokenSource();

        // Wire Cancel to the cts
        // (we repurpose the Upload button as Cancel during zipping)
        _uploadBtn.Text    = "Cancel";
        _uploadBtn.Enabled = true;
        _uploadBtn.Click  -= OnUploadClickAsync;
        _uploadBtn.Click  += (_, _) => cts.Cancel();

        try
        {
            int foldersDone = 0;
            int totalFolders = folders.Count;

            foreach (var (displayName, path) in _pendingPaths)
            {
                if (!Directory.Exists(path))
                {
                    // Plain file — pass through
                    entries.Add(new UploadEntry(path, Path.GetFileName(path), null));
                    continue;
                }

                var folderName = Path.GetFileName(
                    path.TrimEnd(Path.DirectorySeparatorChar,
                                 Path.AltDirectorySeparatorChar));
                var tempZip = Path.Combine(
                    Path.GetTempPath(), $"{folderName}_{Guid.NewGuid():N}.zip");

                foldersDone++;
                _zipLabel.Text = totalFolders == 1
                    ? $"Zipping  {folderName}…"
                    : $"Zipping  {folderName}  ({foldersDone} of {totalFolders})";

                ResetZipBar();

                var progress = new Progress<(long done, long total)>(t =>
                    UpdateZipBar(t.done, t.total));

                // Zip on a thread-pool thread; progress fires back on UI thread via IProgress.
                await Task.Run(() =>
                    ZipProgress.CreateFromDirectoryAsync(path, tempZip, progress, cts.Token),
                    cts.Token);

                entries.Add(new UploadEntry(tempZip, $"{folderName}.zip", tempZip));
            }

            // All done — hand off to MainForm
            SelectedEntries  = entries;
            DialogResult     = DialogResult.OK;
            Close();
        }
        catch (OperationCanceledException)
        {
            // Clean up any partial temp zips
            foreach (var e2 in entries)
                if (e2.TempZipPath is not null)
                    try { File.Delete(e2.TempZipPath); } catch { }

            // Reset UI
            _zipPanel.Visible = false;
            SetFormEnabled(true);
            _uploadBtn.Text    = "Upload";
            _uploadBtn.Click  -= null; // remove cancel handler
            _uploadBtn.Click  += OnUploadClickAsync;
            RefreshFileCount();
        }
        catch (Exception ex)
        {
            foreach (var e2 in entries)
                if (e2.TempZipPath is not null)
                    try { File.Delete(e2.TempZipPath); } catch { }

            _zipPanel.Visible = false;
            SetFormEnabled(true);
            _uploadBtn.Text    = "Upload";
            _uploadBtn.Click  -= null;
            _uploadBtn.Click  += OnUploadClickAsync;
            RefreshFileCount();

            MessageBox.Show($"Failed to zip folder:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ── Zip progress helpers ───────────────────────────────────────────────

    private void ResetZipBar()
    {
        _zipBar.Value      = 0;
        _zipPctLabel.Text  = "0%";
        _zipBytesLbl.Text  = "";
    }

    private void UpdateZipBar(long done, long total)
    {
        if (total <= 0)
        {
            _zipBar.Style = ProgressBarStyle.Marquee;
            return;
        }
        _zipBar.Style = ProgressBarStyle.Continuous;

        double pct   = Math.Clamp((double)done / total, 0, 1);
        int    steps = (int)(pct * 1000);

        if (steps < 1000) { _zipBar.Value = steps + 1; }
        _zipBar.Value      = steps;
        _zipPctLabel.Text  = $"{pct * 100:F0}%";
        _zipBytesLbl.Text  = $"{FormatBytes(done)} / {FormatBytes(total)}";
    }

    // Disable all interactive controls while zipping
    private void SetFormEnabled(bool enabled)
    {
        _fileList.Enabled     = enabled;
        _removeBtn.Enabled    = enabled && _fileList.SelectedIndices.Count > 0;
        _rbRead.Enabled       = enabled;
        _rbFull.Enabled       = enabled;
        _vmList.Enabled       = enabled;
        _selectAllChk.Enabled = enabled;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private void AddLabel(string text, int x, ref int y, bool bold = false, float size = 9f)
    {
        var lbl = new Label
        {
            Text      = text,
            Left      = x,
            Top       = y,
            AutoSize  = true,
            Font      = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
            ForeColor = TextMain,
        };
        Controls.Add(lbl);
        y += lbl.PreferredHeight + 4;
    }

    private static Button MakeButton(string text, bool secondary)
    {
        var btn = new Button
        {
            Text      = text,
            Height    = 30,
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            Cursor    = Cursors.Hand,
            BackColor = secondary ? Color.White : Color.FromArgb(185, 28, 28),
            ForeColor = secondary ? Color.FromArgb(55, 65, 81) : Color.White,
        };
        btn.FlatAppearance.BorderColor = secondary
            ? Color.FromArgb(209, 213, 219)
            : Color.FromArgb(185, 28, 28);
        return btn;
    }

    private static string FormatBytes(long bytes) => bytes switch
    {
        >= 1_073_741_824 => $"{bytes / 1_073_741_824.0:F1} GB",
        >= 1_048_576     => $"{bytes / 1_048_576.0:F1} MB",
        >= 1_024         => $"{bytes / 1_024.0:F1} KB",
        _                => $"{bytes} B",
    };
}

/// <summary>
/// One resolved upload item — file path ready to upload, display name for inbox/outbox,
/// and optional temp zip path to delete after upload completes.
/// </summary>
public record UploadEntry(string FilePath, string DisplayName, string? TempZipPath);
