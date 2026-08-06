using System.Drawing;
using System.Windows.Forms;
using RackoApp.Services;
using RackoApp.Views;

namespace RackoApp;

public class MainForm : Form
{
    // ── Brand colour ──────────────────────────────────────────────────────────
    private static readonly Color Brand    = Color.FromArgb(185, 28,  28);  // #B91C1C
    private static readonly Color Surface  = Color.FromArgb(248, 250, 252); // #F8FAFC
    private static readonly Color CardBg   = Color.White;
    private static readonly Color Border   = Color.FromArgb(226, 232, 240); // #E2E8F0
    private static readonly Color TextMain = Color.FromArgb( 15,  23,  42); // #0F172A
    private static readonly Color TextMute = Color.FromArgb(100, 116, 139); // #64748B

    private readonly RackoApiClient _api;

    // Controls
    private TabControl  _tabs    = null!;
    private DataGridView _inboxGrid  = null!;
    private DataGridView _outboxGrid = null!;
    private Label       _statusLabel = null!;

    public MainForm(AgentConfig config)
    {
        _api = new RackoApiClient(config);
        BuildUI();
        _ = LoadInboxAsync();
    }

    // ── Build UI ──────────────────────────────────────────────────────────────

    private void BuildUI()
    {
        Text            = "Racko Shared Files";
        Size            = new Size(900, 580);
        MinimumSize     = new Size(700, 440);
        BackColor       = Surface;
        StartPosition   = FormStartPosition.CenterScreen;
        Font            = new Font("Segoe UI", 9f, FontStyle.Regular);

        // ── Header ────────────────────────────────────────────────────────────
        var header = new Panel
        {
            Dock      = DockStyle.Top,
            Height    = 52,
            BackColor = CardBg,
            Padding   = new Padding(16, 0, 16, 0),
        };
        header.Paint += (_, e) =>
            e.Graphics.DrawLine(new Pen(Border), 0, header.Height - 1, header.Width, header.Height - 1);

        var logo = new Label
        {
            Text      = "● Racko Shared Files",
            ForeColor = Brand,
            Font      = new Font("Segoe UI", 11f, FontStyle.Bold),
            AutoSize  = true,
            Location  = new Point(16, 14),
        };

        var uploadBtn = new Button
        {
            Text      = "↑  Upload & Share",
            BackColor = Brand,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f, FontStyle.Bold),
            Size      = new Size(140, 30),
            Cursor    = Cursors.Hand,
        };
        uploadBtn.FlatAppearance.BorderSize  = 0;
        uploadBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(160, 23, 23);
        uploadBtn.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        uploadBtn.Location = new Point(header.Width - 160, 11);
        uploadBtn.Click   += async (_, _) => await OnUploadClickAsync();
        header.SizeChanged += (_, _) => uploadBtn.Left = header.Width - 160;

        header.Controls.AddRange(new Control[] { logo, uploadBtn });

        // ── Status label ──────────────────────────────────────────────────────
        _statusLabel = new Label
        {
            Dock      = DockStyle.Fill,
            Text      = "Loading…",
            ForeColor = TextMute,
            Font      = new Font("Segoe UI", 10f),
            TextAlign = ContentAlignment.MiddleCenter,
            Visible   = true,
        };

        // ── Tabs ──────────────────────────────────────────────────────────────
        _tabs = new TabControl
        {
            Dock     = DockStyle.Fill,
            Padding  = new Point(12, 6),
            Font     = new Font("Segoe UI", 9f),
        };

        var inboxPage  = new TabPage("↓  Received");
        var outboxPage = new TabPage("↑  Sent");

        _inboxGrid  = BuildGrid();
        _outboxGrid = BuildGrid();

        _inboxGrid.CellDoubleClick  += (_, e) => { if (e.RowIndex >= 0) _ = OnInboxDoubleClickAsync(e.RowIndex); };
        _outboxGrid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OnOutboxDoubleClick(e.RowIndex); };

        inboxPage.Controls.Add(_inboxGrid);
        outboxPage.Controls.Add(_outboxGrid);
        _tabs.TabPages.Add(inboxPage);
        _tabs.TabPages.Add(outboxPage);

        _tabs.SelectedIndexChanged += (_, _) =>
        {
            if (_tabs.SelectedIndex == 0) _ = LoadInboxAsync();
            else _ = LoadOutboxAsync();
        };

        // Refresh button in tab area
        var refreshBtn = new Button
        {
            Text      = "↺",
            FlatStyle = FlatStyle.Flat,
            Size      = new Size(28, 22),
            Cursor    = Cursors.Hand,
            Font      = new Font("Segoe UI", 10f),
        };
        refreshBtn.FlatAppearance.BorderSize = 0;
        refreshBtn.Click += (_, _) =>
        {
            if (_tabs.SelectedIndex == 0) _ = LoadInboxAsync();
            else _ = LoadOutboxAsync();
        };

        // Main layout
        var body = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12) };
        body.Controls.Add(_tabs);
        body.Controls.Add(_statusLabel);

        Controls.Add(body);
        Controls.Add(header);
    }

    private static DataGridView BuildGrid()
    {
        var grid = new DataGridView
        {
            Dock                    = DockStyle.Fill,
            ReadOnly                = true,
            AllowUserToAddRows      = false,
            AllowUserToDeleteRows   = false,
            SelectionMode           = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect             = false,
            AutoSizeRowsMode        = DataGridViewAutoSizeRowsMode.AllCells,
            ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize,
            BackgroundColor         = Color.White,
            BorderStyle             = BorderStyle.None,
            RowHeadersVisible       = false,
            GridColor               = Color.FromArgb(226, 232, 240),
            Font                    = new Font("Segoe UI", 9f),
        };
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(254, 242, 242);
        grid.DefaultCellStyle.SelectionForeColor = Color.FromArgb(15, 23, 42);
        grid.ColumnHeadersDefaultCellStyle.Font  = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248, 250, 252);
        grid.EnableHeadersVisualStyles = false;
        return grid;
    }

    // ── Load data ──────────────────────────────────────────────────────────────

    private async Task LoadInboxAsync()
    {
        ShowStatus("Loading received files…");
        try
        {
            var files = await _api.ListInboxAsync();
            _inboxGrid.Columns.Clear();
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 260, DataPropertyName = "FileName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "From",        Width = 160, DataPropertyName = "SourceMachineName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared",      Width = 140, DataPropertyName = "CreatedAtFormatted" });
            _inboxGrid.AutoGenerateColumns = false;
            _inboxGrid.DataSource = files.Select(f => new InboxRow(f)).ToList();

            ShowGrid(inbox: true, empty: !files.Any(),
                emptyMsg: "No files shared with this VM yet.\nDouble-click a row to download.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    private async Task LoadOutboxAsync()
    {
        ShowStatus("Loading sent files…");
        try
        {
            var files = await _api.ListOutboxAsync();
            _outboxGrid.Columns.Clear();
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 260, DataPropertyName = "FileName" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared With", Width = 100, DataPropertyName = "SharedWithCount" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Uploaded",    Width = 140, DataPropertyName = "CreatedAtFormatted" });
            _outboxGrid.AutoGenerateColumns = false;
            _outboxGrid.DataSource = files.Select(f => new OutboxRow(f)).ToList();

            ShowGrid(inbox: false, empty: !files.Any(),
                emptyMsg: "You have not shared any files yet.\nClick 'Upload & Share' to get started.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    // ── Upload ─────────────────────────────────────────────────────────────────

    private async Task OnUploadClickAsync()
    {
        IReadOnlyList<MachineDto> machines;
        try { machines = await _api.ListMachinesAsync(); }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not load VM list:\n{ex.Message}",
                "Racko", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var dlg = new UploadForm(machines);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        try
        {
            await _api.UploadAsync(dlg.SelectedFilePath, dlg.SelectedPermission, dlg.SelectedMachineIds);
            MessageBox.Show(
                $"'{Path.GetFileName(dlg.SelectedFilePath)}' shared with {dlg.SelectedMachineIds.Length} VM(s).",
                "Racko — Uploaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
            _ = LoadOutboxAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Upload failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ── Row interactions ───────────────────────────────────────────────────────

    private async Task OnInboxDoubleClickAsync(int rowIndex)
    {
        if (_inboxGrid.DataSource is not List<InboxRow> rows || rowIndex >= rows.Count) return;
        var file = rows[rowIndex].File;

        using var save = new SaveFileDialog
        {
            FileName         = file.FileName,
            InitialDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
        };
        if (save.ShowDialog(this) != DialogResult.OK) return;

        try
        {
            var destDir  = Path.GetDirectoryName(save.FileName)!;
            var destName = Path.GetFileName(save.FileName);
            await _api.DownloadAsync(file.Id, destName, destDir);
            MessageBox.Show($"Saved to:\n{save.FileName}",
                "Racko — Downloaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Download failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OnOutboxDoubleClick(int rowIndex)
    {
        if (_outboxGrid.DataSource is not List<OutboxRow> rows || rowIndex >= rows.Count) return;
        var file = rows[rowIndex].File;

        using var dlg = new ManageForm(file, _api);
        if (dlg.ShowDialog(this) == DialogResult.OK)
            _ = LoadOutboxAsync();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private void ShowStatus(string msg)
    {
        _statusLabel.Text    = msg;
        _statusLabel.Visible = true;
        _inboxGrid.Visible   = false;
        _outboxGrid.Visible  = false;
    }

    private void ShowGrid(bool inbox, bool empty, string emptyMsg)
    {
        if (empty) { ShowStatus(emptyMsg); return; }
        _statusLabel.Visible = false;
        _inboxGrid.Visible   = inbox;
        _outboxGrid.Visible  = !inbox;
    }
}

// ── Row view-models ────────────────────────────────────────────────────────────

public class InboxRow(SharedFileDto file)
{
    public SharedFileDto File              => file;
    public string FileName                => file.FileName;
    public string SourceMachineName       => file.SourceMachineName;
    public string PermissionLabel         => file.PermissionLabel;
    public string SizeLabel               => file.SizeLabel;
    public string CreatedAtFormatted      => Fmt(file.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy HH:mm") : s;
}

public class OutboxRow(SharedFileDto file)
{
    public SharedFileDto File              => file;
    public string FileName                => file.FileName;
    public string PermissionLabel         => file.PermissionLabel;
    public string SharedWithCount         => $"{file.SharedWithMachineIds.Length} VM(s)";
    public string SizeLabel               => file.SizeLabel;
    public string CreatedAtFormatted      => Fmt(file.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy HH:mm") : s;
}
