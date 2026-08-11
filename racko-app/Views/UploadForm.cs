using System.Drawing;
using System.IO.Compression;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp.Views;

public class UploadForm : Form
{
    public string   SelectedFilePath   { get; private set; } = "";
    public string   SelectedPermission { get; private set; } = "read";
    public string[] SelectedMachineIds { get; private set; } = [];
    /// <summary>Display name for folder uploads (e.g. "MyProject.zip"). Null for regular files.</summary>
    public string?  SelectedDisplayName { get; private set; }

    // When uploading a folder this holds the temp zip path (deleted after upload)
    private string? _tempZipPath;

    /// <summary>Exposed so MainForm can delete the temp zip after upload completes.</summary>
    public string? TempZipPath => _tempZipPath;

    private readonly IReadOnlyList<MachineDto> _machines;

    private Label          _fileLabel     = null!;
    private RadioButton    _rbRead        = null!;
    private RadioButton    _rbFull        = null!;
    private CheckedListBox _vmList        = null!;
    private Button         _uploadBtn     = null!;
    private CheckBox       _selectAllChk  = null!;   // Select All / Deselect All toggle

    public UploadForm(IReadOnlyList<MachineDto> machines)
    {
        _machines = machines;
        BuildUI();
    }

    private void BuildUI()
    {
        Text            = "Upload & Share File";
        Size            = new Size(460, 500);
        MinimumSize     = new Size(440, 480);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox     = false;
        MinimizeBox     = false;
        StartPosition   = FormStartPosition.CenterParent;
        BackColor       = Color.FromArgb(248, 250, 252);
        Font            = new Font("Segoe UI", 9f);

        var pad = 20;
        var y   = pad;

        // ── Title ─────────────────────────────────────────────────────────────
        AddLabel("Upload & Share File", pad, ref y, bold: true, size: 12f);
        y += 6;

        // ── File picker ───────────────────────────────────────────────────────
        AddLabel("File or Folder", pad, ref y);
        var fileRow = new Panel { Left = pad, Top = y, Width = ClientSize.Width - pad * 2, Height = 30 };
        _fileLabel = new Label
        {
            Text      = "No file or folder selected",
            ForeColor = Color.FromArgb(148, 163, 184),
            AutoSize  = false,
            Width     = fileRow.Width - 210,
            Height    = 30,
            Left      = 0,
            Top       = 0,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        var browseFolderBtn = MakeButton("📁 Folder", secondary: true);
        browseFolderBtn.Left   = fileRow.Width - 210;
        browseFolderBtn.Top    = 0;
        browseFolderBtn.Width  = 100;
        browseFolderBtn.Height = 28;
        browseFolderBtn.Click += OnBrowseFolderClick;

        var browseBtn = MakeButton("📄 File", secondary: true);
        browseBtn.Left   = fileRow.Width - 100;
        browseBtn.Top    = 0;
        browseBtn.Width  = 90;
        browseBtn.Height = 28;
        browseBtn.Click += OnBrowseClick;
        fileRow.Controls.AddRange(new Control[] { _fileLabel, browseFolderBtn, browseBtn });
        Controls.Add(fileRow);
        y += 38;

        // ── Permission ────────────────────────────────────────────────────────
        AddLabel("Permission", pad, ref y);
        _rbRead = new RadioButton { Text = "Read Only",    Checked = true, Left = pad,       Top = y, AutoSize = true };
        _rbFull = new RadioButton { Text = "Full Control", Left = pad + 130, Top = y, AutoSize = true };
        Controls.AddRange(new Control[] { _rbRead, _rbFull });
        y += 30;

        // ── VM list header: "Share with VMs" label + Select All checkbox ────────
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

        // CheckBox styled as a button — left-aligned, no right-edge calculation needed.
        // Appearance.Button makes it look like a toggle button.
        // No DPI positioning issues — Left is a fixed offset from the label.
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
        _selectAllChk.FlatAppearance.BorderColor        = Color.FromArgb(185, 28, 28);
        _selectAllChk.FlatAppearance.CheckedBackColor   = Color.FromArgb(254, 242, 242);
        _selectAllChk.CheckedChanged += OnSelectAllCheckChanged;
        Controls.Add(_selectAllChk);

        y += vmLabel.PreferredHeight + 8;

        // ── VM CheckedListBox ─────────────────────────────────────────────────
        _vmList = new CheckedListBox
        {
            Left         = pad,
            Top          = y,
            Width        = ClientSize.Width - pad * 2,
            Height       = 130,
            CheckOnClick = true,
            BorderStyle  = BorderStyle.FixedSingle,
            Font         = new Font("Segoe UI", 9f),
        };
        if (_machines.Count == 0)
            _vmList.Items.Add("No other VMs found on your account.");
        else
            foreach (var m in _machines)
                _vmList.Items.Add(m.Name);

        // Update Select All button text when individual items are toggled
        _vmList.ItemCheck += (_, _) => UpdateSelectAllLabel();
        Controls.Add(_vmList);
        y += 138;

        // ── Footer buttons ────────────────────────────────────────────────────
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

    // ── Select All / Deselect All ─────────────────────────────────────────────

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
        // Use BeginInvoke because ItemCheck fires before the check state is updated
        BeginInvoke(() =>
        {
            bool allChecked = _vmList.CheckedIndices.Count == _vmList.Items.Count;
            _selectAllChk.Checked = allChecked;
            _selectAllChk.Text    = allChecked ? "Deselect All" : "Select All";
        });
    }

    // ── Browse & Upload ───────────────────────────────────────────────────────

    private void OnBrowseClick(object? s, EventArgs e)
    {
        using var dlg = new OpenFileDialog { Title = "Select a file to share", Filter = "All Files (*.*)|*.*" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        // Clear any previous folder selection
        if (_tempZipPath is not null)
        {
            try { File.Delete(_tempZipPath); } catch { }
            _tempZipPath = null;
        }

        SelectedFilePath     = dlg.FileName;
        _fileLabel.Text      = Path.GetFileName(dlg.FileName);
        _fileLabel.ForeColor = Color.FromArgb(15, 23, 42);
        _uploadBtn.Enabled   = true;
    }

    private void OnBrowseFolderClick(object? s, EventArgs e)
    {
        using var dlg = new FolderBrowserDialog
        {
            Description         = "Select a folder to share",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = false,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        // Clear any previous folder selection
        if (_tempZipPath is not null)
        {
            try { File.Delete(_tempZipPath); } catch { }
            _tempZipPath = null;
        }

        var folderPath = dlg.SelectedPath;
        var folderName = Path.GetFileName(folderPath);
        _fileLabel.Text      = $"📁 {folderName}  (will be zipped)";
        _fileLabel.ForeColor = Color.FromArgb(15, 23, 42);
        // Store folder path as SelectedFilePath temporarily — OnUploadClick will zip it
        SelectedFilePath   = folderPath;
        _uploadBtn.Enabled = true;
    }

    private void OnUploadClick(object? s, EventArgs e)
    {
        SelectedPermission = _rbFull.Checked ? "full" : "read";

        if (_machines.Count == 0) { DialogResult = DialogResult.OK; Close(); return; }

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

        // If SelectedFilePath is a directory, zip it first (background thread so UI stays responsive)
        if (Directory.Exists(SelectedFilePath))
        {
            _uploadBtn.Enabled = false;
            _uploadBtn.Text    = "Zipping…";
            var folderPath = SelectedFilePath;
            var folderName = Path.GetFileName(folderPath);
            Task.Run(() =>
            {
                // Zip to a temp file — streaming, never fully in memory
                var tempZip = Path.Combine(Path.GetTempPath(), $"{folderName}_{Guid.NewGuid():N}.zip");
                ZipFile.CreateFromDirectory(folderPath, tempZip, CompressionLevel.Fastest, includeBaseDirectory: true);
                return tempZip;
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
                _tempZipPath        = t.Result;
                SelectedFilePath    = t.Result;              // temp zip path for upload
                SelectedDisplayName = $"{folderName}.zip";   // display name shown in inbox/outbox
                DialogResult        = DialogResult.OK;
                Close();
            }, TaskScheduler.FromCurrentSynchronizationContext());
            return;
        }

        DialogResult = DialogResult.OK;
        Close();
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
