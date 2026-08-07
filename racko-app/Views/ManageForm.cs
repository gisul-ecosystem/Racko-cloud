using System.Drawing;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp.Views;

public class ManageForm : Form
{
    private readonly SharedFileDto  _file;
    private readonly RackoApiClient _api;

    private RadioButton    _rbRead      = null!;
    private RadioButton    _rbFull      = null!;
    private CheckedListBox _vmList      = null!;
    private IReadOnlyList<MachineDto> _machines = [];

    public ManageForm(SharedFileDto file, RackoApiClient api)
    {
        _file = file;
        _api  = api;
        BuildUI();
        _ = LoadMachinesAsync();
    }

    private void BuildUI()
    {
        Text            = $"Manage: {_file.FileName}";
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
        var title = new Label
        {
            Text      = $"Manage: {_file.FileName}",
            Left      = pad,
            Top       = y,
            Width     = ClientSize.Width - pad * 2,
            AutoSize  = false,
            Font      = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
        };
        Controls.Add(title);
        y += 28;

        // ── File info ─────────────────────────────────────────────────────────
        var info = new Label
        {
            Text      = $"{_file.FileName}  ·  {_file.SizeLabel}",
            Left      = pad,
            Top       = y,
            Width     = ClientSize.Width - pad * 2,
            AutoSize  = false,
            ForeColor = Color.FromArgb(100, 116, 139),
            Font      = new Font("Segoe UI", 8.5f),
        };
        Controls.Add(info);
        y += 24;

        // ── Permission ────────────────────────────────────────────────────────
        AddLabel("Permission", pad, ref y);
        _rbRead = new RadioButton { Text = "Read Only",    Left = pad,       Top = y, AutoSize = true };
        _rbFull = new RadioButton { Text = "Full Control", Left = pad + 130, Top = y, AutoSize = true };

        // Set current permission — only read or full
        _rbFull.Checked = _file.Permission == "full";
        _rbRead.Checked = _file.Permission != "full";

        Controls.AddRange(new Control[] { _rbRead, _rbFull });
        y += 30;

        // ── VM list ───────────────────────────────────────────────────────────
        AddLabel("Share with VMs", pad, ref y);
        _vmList = new CheckedListBox
        {
            Left         = pad,
            Top          = y,
            Width        = ClientSize.Width - pad * 2,
            Height       = 120,
            CheckOnClick = true,
            BorderStyle  = BorderStyle.FixedSingle,
            Font         = new Font("Segoe UI", 9f),
        };
        _vmList.Items.Add("Loading VMs…");
        Controls.Add(_vmList);
        y += 128;

        // ── Buttons ───────────────────────────────────────────────────────────
        // Delete on left, Cancel + Save on right
        var deleteBtn = MakeButton("Delete File", danger: true);
        deleteBtn.Left   = pad;
        deleteBtn.Top    = y + 10;
        deleteBtn.Width  = 100;
        deleteBtn.Click += OnDeleteClick;

        var cancelBtn = MakeButton("Cancel", secondary: true);
        cancelBtn.Left   = ClientSize.Width - pad - 200;
        cancelBtn.Top    = y + 10;
        cancelBtn.Width  = 90;
        cancelBtn.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

        var saveBtn = MakeButton("Save Changes", secondary: false);
        saveBtn.Left   = ClientSize.Width - pad - 100;
        saveBtn.Top    = y + 10;
        saveBtn.Width  = 90;
        saveBtn.Click += OnSaveClick;

        Controls.AddRange(new Control[] { deleteBtn, cancelBtn, saveBtn });
    }

    private async Task LoadMachinesAsync()
    {
        try
        {
            _machines = await _api.ListMachinesAsync();
            _vmList.Items.Clear();
            if (!_machines.Any())
            {
                _vmList.Items.Add("No other VMs found.");
                return;
            }
            foreach (var m in _machines)
            {
                _vmList.Items.Add(m.Name, _file.SharedWithMachineIds.Contains(m.Id));
            }
        }
        catch
        {
            _vmList.Items.Clear();
            _vmList.Items.Add("Could not load VM list.");
        }
    }

    private async void OnSaveClick(object? s, EventArgs e)
    {
        var permission = _rbFull.Checked ? "full" : "read";

        var ids = new List<string>();
        for (int i = 0; i < _vmList.CheckedIndices.Count; i++)
        {
            if (_machines.Count > 0 && i < _machines.Count)
                ids.Add(_machines[_vmList.CheckedIndices[i]].Id);
        }

        try
        {
            await _api.UpdateShareAsync(_file.Id, permission, [.. ids]);
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Update failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async void OnDeleteClick(object? s, EventArgs e)
    {
        var confirm = MessageBox.Show(
            $"Permanently delete '{_file.FileName}'?\nThis cannot be undone.",
            "Racko — Confirm Delete",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

        if (confirm != DialogResult.Yes) return;

        try
        {
            await _api.DeleteAsync(_file.Id);
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Delete failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AddLabel(string text, int x, ref int y)
    {
        var lbl = new Label
        {
            Text      = text,
            Left      = x,
            Top       = y,
            AutoSize  = true,
            Font      = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
        };
        Controls.Add(lbl);
        y += lbl.PreferredHeight + 4;
    }

    private static Button MakeButton(string text, bool secondary = false, bool danger = false)
    {
        var btn = new Button
        {
            Text      = text,
            Height    = 30,
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            Cursor    = Cursors.Hand,
        };
        if (danger)
        {
            btn.BackColor = Color.FromArgb(254, 242, 242);
            btn.ForeColor = Color.FromArgb(220, 38, 38);
            btn.FlatAppearance.BorderColor = Color.FromArgb(252, 202, 202);
        }
        else if (secondary)
        {
            btn.BackColor = Color.White;
            btn.ForeColor = Color.FromArgb(55, 65, 81);
            btn.FlatAppearance.BorderColor = Color.FromArgb(209, 213, 219);
        }
        else
        {
            btn.BackColor = Color.FromArgb(185, 28, 28);
            btn.ForeColor = Color.White;
            btn.FlatAppearance.BorderColor = Color.FromArgb(185, 28, 28);
        }
        return btn;
    }
}
