using System.Drawing;
using System.IO.Compression;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp.Views;

public class UploadForm : Form
{
    // ── Outputs read by MainForm after DialogResult.OK ─────────────────────────
    /// <summary>
    /// One entry per file/folder to upload. Each entry has the resolved file path
    /// (temp zip for folders), the display name shown in inbox/outbox, and an
    /// optional temp zip path to delete after upload completes.
    /// </summary>
    public IReadOnlyList<UploadEntry> SelectedEntries { get; private set; } = [];
    public string   SelectedPermission { get; private set; } = "read";
    public string[] SelectedMachineIds { get; private set; } = [];

    private readonly IReadOnlyList<MachineDto> _machines;

    // Tracks selected paths before the user clicks Upload
    // Key = display name, Value = actual path (file or folder)
    private readonly List<(string DisplayName, string ActualPath)> _pendingPaths = [];

    private ListBox        _fileList      = null!;
    private Button         _removeBtn     = null!;
    private RadioButton    _rbRead        = null!;
    private RadioButton    _rbFull        = null!;
    private CheckedListBox _vmList        = null!;
    private Button         _uploadBtn     = null!;
    private CheckBox       _selectAllChk  = null!;
    private Label          _fileCountLbl  = null!;

    public UploadForm(IReadOnlyList<MachineDto> machines)
    {
        _machines = machines;
        BuildUI();
    }

    private void BuildUI()
    {
        Text            = "Upload & Share Files";
        Size            = new Size(480, 580);
        MinimumSize     = new Size(460, 560);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        StartPosition   = FormStartPosition.CenterParent;
        BackColor       = Color.FromArgb(248, 250, 252);
        Font            = new Font("Segoe UI", 9f);

        var pad = 20;
        var y   = pad;

        // ── Title ─────────────────────────────────────────────────────────────
        AddLabel("Upload & Share Files", pad, ref y, bold: true, size: 12f);
        y += 6;

        // ── File picker row ───────────────────────────────────────────────────
        AddLabel("Files or Folders", pad, ref y);

        var fileRow = new Panel { Left = pad, Top = y, Width = ClientSize.Width - pad * 2, Height = 30 };

        _fileCountLbl = new Label
        {
            Text      = "No files selected",
            ForeColor = Color.FromArgb(148, 163, 184),
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

        // ── Selected files list ───────────────────────────────────────────────
        _fileList = new ListBox
        {
            Left        = pad,
            Top         = y,
            Width       = ClientSize.Width - pad * 2,
            Height      = 90,
            BorderStyle = BorderStyle.FixedSingle,
            Font        = new Font("Segoe UI", 8.5f),
            SelectionMode = SelectionMode.MultiExtended,
        };
        Controls.Add(_fileList);
        y += 94;

        // Remove selected button
        _removeBtn = MakeButton("✕ Remove Selected", secondary: true);
        _removeBtn.Left    = pad;
        _removeBtn.Top     = y;
        _removeBtn.Width   = 140;
        _removeBtn.Height  = 24;
        _removeBtn.Font    = new Font("Segoe UI", 8f);
        _removeBtn.Enabled = false;
        _removeBtn.Click  += OnRemoveClick;
        Controls.Add(_removeBtn);
        _fileList.SelectedIndexChanged += (_, _) => _removeBtn.Enabled = _fileList.SelectedIndices.Count > 0;
        y += 30;

        // ── Permission ────────────────────────────────────────────────────────
        AddLabel("Permission", pad, ref y);
        _rbRead = new RadioButton { Text = "Read Only",    Checked = true, Left = pad,       Top = y, AutoSize = true };
        _rbFull = new RadioButton { Text = "Full Control", Left = pad + 130, Top = y, AutoSize = true };
        Controls.AddRange(new Control[] { _rbRead, _rbFull });
        y += 30;

        // ── VM list header ────────────────────────────────────────────────────
        var vmLabel = new Label
        {
            Text      = "Share with VMs",
            Left      = pad,
            Top       = y,
            AutoSize  = true,
            Font      = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
        };
        Controls.Add(vmLabel);

        _selectAllChk = new CheckBox
        {
            Text        = "Select All",
            Appearance  = Appearance.Button,
            FlatStyle   = FlatStyle.Flat,
            Font        = new Font("Segoe UI", 8f),
            AutoSize    = true,
            Left        = pad + vmLabel.PreferredWidth + 12,
            Top         = y - 1,
            Cursor      = Cursors.Hand,
            BackColor   = Color.White,
            ForeColor   = Color.FromArgb(185, 28, 28),
        };
        _selectAllChk.FlatAppearance.BorderColor      = Color.FromArgb(185, 28, 28);
        _selectAllChk.FlatAppearance.CheckedBackColor = Color.FromArgb(254, 242, 242);
        _selectAllChk.CheckedChanged += OnSelectAllCheckChanged;
        Controls.Add(_selectAllChk);
        y += vmLabel.PreferredHeight + 8;

        // ── VM CheckedListBox ─────────────────────────────────────────────────
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

        // ── Footer ────────────────────────────────────────────────────────────
        var cancelBtn = MakeButton("Cancel", secondary: true);
        cancelBtn.Left   = ClientSize.Width - pad - 200;
        cancelBtn.Top    = y + 10;
        cancelBtn.Width  = 90;
        cancelBtn.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        _uploadBtn         = MakeButton("Upload", secondary: false);
        _uploadBtn.Left    = ClientSize.Width - pad - 100;
        _uploadBtn.Top     = y + 10;
        _uploadBtn.Width   = 90;
        _uploadBtn.Enabled = false;
        _uploadBtn.Click  += OnUploadClick;

        Controls.AddRange(new Control[] { cancelBtn, _uploadBtn });
    }

    // ── Browse ────────────────────────────────────────────────────────────────

    private void OnBrowseClick(object? s, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title      = "Select files to share",
            Filter     = "All Files (*.*)|*.*",
            Multiselect = true,
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

        var folderPath = dlg.SelectedPath;
        var folderName = Path.GetFileName(folderPath);
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
        // Remove in reverse index order so indices don't shift
        var indices = _fileList.SelectedIndices.Cast<int>().OrderByDescending(i => i).ToList();
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
        _fileCountLbl.ForeColor = n == 0 ? Color.FromArgb(148, 163, 184) : Color.FromArgb(15, 23, 42);
        _uploadBtn.Enabled      = n > 0;
    }

    // ── Select All ────────────────────────────────────────────────────────────

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

    // ── Upload click ──────────────────────────────────────────────────────────

    private void OnUploadClick(object? s, EventArgs e)
    {
        if (_pendingPaths.Count == 0) return;

        SelectedPermission = _rbFull.Checked ? "full" : "read";

        if (_machines.Count > 0)
        {
            var ids = new List<string>();
            for (int i = 0; i < _vmList.CheckedIndices.Count; i++)
                ids.Add(_machines[_vmList.CheckedIndices[i]].Id);

            if (!ids.Any())
            {
                MessageBox.Show("Please select at least one VM to share with.",
                    "Racko", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            SelectedMachineIds = [.. ids];
        }

        // Check if any folders need zipping
        var folders = _pendingPaths.Where(p => Directory.Exists(p.ActualPath)).ToList();
        if (folders.Count == 0)
        {
            // All plain files — resolve immediately
            SelectedEntries = _pendingPaths
                .Select(p => new UploadEntry(p.ActualPath, Path.GetFileName(p.ActualPath), null))
                .ToList();
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        // Zip folders in background
        _uploadBtn.Enabled = false;
        _uploadBtn.Text    = $"Zipping {folders.Count} folder{(folders.Count != 1 ? "s" : "")}…";

        Task.Run(() =>
        {
            var entries = new List<UploadEntry>();
            foreach (var (displayName, path) in _pendingPaths)
            {
                if (Directory.Exists(path))
                {
                    var folderName = Path.GetFileName(path);
                    var tempZip = Path.Combine(Path.GetTempPath(), $"{folderName}_{Guid.NewGuid():N}.zip");
                    ZipFile.CreateFromDirectory(path, tempZip, CompressionLevel.Fastest, includeBaseDirectory: true);
                    entries.Add(new UploadEntry(tempZip, $"{folderName}.zip", tempZip));
                }
                else
                {
                    entries.Add(new UploadEntry(path, Path.GetFileName(path), null));
                }
            }
            return entries;
        }).ContinueWith(t =>
        {
            if (t.IsFaulted)
            {
                _uploadBtn.Enabled = true;
                _uploadBtn.Text    = "Upload";
                MessageBox.Show($"Failed to zip folder:\n{t.Exception?.InnerException?.Message}",
                    "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            SelectedEntries  = t.Result;
            DialogResult     = DialogResult.OK;
            Close();
        }, TaskScheduler.FromCurrentSynchronizationContext());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void AddLabel(string text, int x, ref int y, bool bold = false, float size = 9f)
    {
        var lbl = new Label
        {
            Text      = text,
            Left      = x,
            Top       = y,
            AutoSize  = true,
            Font      = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
            ForeColor = Color.FromArgb(15, 23, 42),
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
}

/// <summary>
/// One resolved upload item — file path ready for upload, display name for inbox/outbox,
/// and optional temp zip path to delete after upload completes.
/// </summary>
public record UploadEntry(string FilePath, string DisplayName, string? TempZipPath);
