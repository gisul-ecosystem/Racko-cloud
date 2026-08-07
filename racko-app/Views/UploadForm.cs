using System.Drawing;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp.Views;

public class UploadForm : Form
{
    public string   SelectedFilePath  { get; private set; } = "";
    public string   SelectedPermission { get; private set; } = "read";
    public string[] SelectedMachineIds { get; private set; } = [];

    private readonly IReadOnlyList<MachineDto> _machines;

    private Label        _fileLabel   = null!;
    private RadioButton  _rbRead      = null!;
    private RadioButton  _rbFull      = null!;
    private CheckedListBox _vmList    = null!;
    private Button       _uploadBtn   = null!;

    public UploadForm(IReadOnlyList<MachineDto> machines)
    {
        _machines = machines;
        BuildUI();
    }

    private void BuildUI()
    {
        Text            = "Upload & Share File";
        Size            = new Size(460, 460);
        MinimumSize     = new Size(440, 440);
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
        AddLabel("File", pad, ref y);
        var fileRow = new Panel { Left = pad, Top = y, Width = ClientSize.Width - pad * 2, Height = 30 };
        _fileLabel = new Label
        {
            Text      = "No file selected",
            ForeColor = Color.FromArgb(148, 163, 184),
            AutoSize  = false,
            Width     = fileRow.Width - 100,
            Height    = 30,
            Left      = 0,
            Top       = 0,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        var browseBtn = MakeButton("Browse…", secondary: true);
        browseBtn.Left   = fileRow.Width - 90;
        browseBtn.Top    = 0;
        browseBtn.Width  = 90;
        browseBtn.Height = 28;
        browseBtn.Click += OnBrowseClick;
        fileRow.Controls.AddRange(new Control[] { _fileLabel, browseBtn });
        Controls.Add(fileRow);
        y += 38;

        // ── Permission — Read Only or Full Control only ───────────────────────
        AddLabel("Permission", pad, ref y);
        _rbRead = new RadioButton { Text = "Read Only",    Checked = true, Left = pad,       Top = y, AutoSize = true };
        _rbFull = new RadioButton { Text = "Full Control", Left = pad + 130, Top = y, AutoSize = true };
        Controls.AddRange(new Control[] { _rbRead, _rbFull });
        y += 30;

        // ── VM list ───────────────────────────────────────────────────────────
        AddLabel("Share with VMs", pad, ref y);
        _vmList = new CheckedListBox
        {
            Left           = pad,
            Top            = y,
            Width          = ClientSize.Width - pad * 2,
            Height         = 130,
            CheckOnClick   = true,
            BorderStyle    = BorderStyle.FixedSingle,
            Font           = new Font("Segoe UI", 9f),
        };
        if (_machines.Count == 0)
            _vmList.Items.Add("No other VMs found on your account.");
        else
            foreach (var m in _machines)
                _vmList.Items.Add(m.Name);
        Controls.Add(_vmList);
        y += 138;

        // ── Buttons ───────────────────────────────────────────────────────────
        var cancelBtn = MakeButton("Cancel", secondary: true);
        cancelBtn.Left   = ClientSize.Width - pad - 200;
        cancelBtn.Top    = y + 10;
        cancelBtn.Width  = 90;
        cancelBtn.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        _uploadBtn          = MakeButton("Upload", secondary: false);
        _uploadBtn.Left     = ClientSize.Width - pad - 100;
        _uploadBtn.Top      = y + 10;
        _uploadBtn.Width    = 90;
        _uploadBtn.Enabled  = false;
        _uploadBtn.Click   += OnUploadClick;

        Controls.AddRange(new Control[] { cancelBtn, _uploadBtn });
    }

    private void OnBrowseClick(object? s, EventArgs e)
    {
        using var dlg = new OpenFileDialog { Title = "Select a file to share", Filter = "All Files (*.*)|*.*" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        SelectedFilePath    = dlg.FileName;
        _fileLabel.Text     = Path.GetFileName(dlg.FileName);
        _fileLabel.ForeColor = Color.FromArgb(15, 23, 42);
        _uploadBtn.Enabled  = true;
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
            Font      = new Font("Segoe UI", 9f, FontStyle.Regular),
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
