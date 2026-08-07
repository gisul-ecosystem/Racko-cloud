using System.Drawing;
using System.IO;
using System.Windows.Forms;
using RackoApp.Services;
using RackoApp.Views;

namespace RackoApp;

public class MainForm : Form
{
    // ── Brand colours ──────────────────────────────────────────────────────────
    private static readonly Color Brand    = Color.FromArgb(185, 28,  28);
    private static readonly Color Surface  = Color.FromArgb(248, 250, 252);
    private static readonly Color TextMute = Color.FromArgb(100, 116, 139);

    private readonly RackoApiClient _api;

    private TabControl   _tabs        = null!;
    private DataGridView _inboxGrid   = null!;
    private DataGridView _outboxGrid  = null!;
    private Label        _statusLabel = null!;

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
        Size            = new Size(920, 580);
        MinimumSize     = new Size(700, 440);
        BackColor       = Surface;
        StartPosition   = FormStartPosition.CenterScreen;
        Font            = new Font("Segoe UI", 9f, FontStyle.Regular);

        // ── Header ────────────────────────────────────────────────────────────
        var header = new Panel
        {
            Dock      = DockStyle.Top,
            Height    = 52,
            BackColor = Color.White,
            Padding   = new Padding(16, 0, 16, 0),
        };
        header.Paint += (_, e) =>
            e.Graphics.DrawLine(new Pen(Color.FromArgb(226, 232, 240)),
                0, header.Height - 1, header.Width, header.Height - 1);

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
        uploadBtn.FlatAppearance.BorderSize          = 0;
        uploadBtn.FlatAppearance.MouseOverBackColor  = Color.FromArgb(160, 23, 23);
        uploadBtn.Anchor  = AnchorStyles.Top | AnchorStyles.Right;
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
            Dock    = DockStyle.Fill,
            Padding = new Point(12, 6),
            Font    = new Font("Segoe UI", 9f),
        };

        var inboxPage  = new TabPage("↓  Received");
        var outboxPage = new TabPage("↑  Sent");

        _inboxGrid  = BuildGrid();
        _outboxGrid = BuildGrid();

        // Inbox: double-click opens or downloads based on permission
        _inboxGrid.CellDoubleClick  += (_, e) => { if (e.RowIndex >= 0) _ = OnInboxDoubleClickAsync(e.RowIndex); };
        // Outbox: double-click opens manage dialog; delete button handled by CellClick
        _outboxGrid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OnOutboxDoubleClick(e.RowIndex); };
        _outboxGrid.CellClick       += (_, e) => { if (e.RowIndex >= 0) _ = OnOutboxCellClickAsync(e.RowIndex, e.ColumnIndex); };

        inboxPage.Controls.Add(_inboxGrid);
        outboxPage.Controls.Add(_outboxGrid);
        _tabs.TabPages.Add(inboxPage);
        _tabs.TabPages.Add(outboxPage);
        _tabs.SelectedIndexChanged += (_, _) =>
        {
            if (_tabs.SelectedIndex == 0) _ = LoadInboxAsync();
            else _ = LoadOutboxAsync();
        };

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
            Dock                        = DockStyle.Fill,
            ReadOnly                    = true,
            AllowUserToAddRows          = false,
            AllowUserToDeleteRows       = false,
            SelectionMode               = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect                 = false,
            AutoSizeRowsMode            = DataGridViewAutoSizeRowsMode.AllCells,
            ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize,
            BackgroundColor             = Color.White,
            BorderStyle                 = BorderStyle.None,
            RowHeadersVisible           = false,
            GridColor                   = Color.FromArgb(226, 232, 240),
            Font                        = new Font("Segoe UI", 9f),
        };
        grid.DefaultCellStyle.SelectionBackColor    = Color.FromArgb(254, 242, 242);
        grid.DefaultCellStyle.SelectionForeColor    = Color.FromArgb(15, 23, 42);
        grid.ColumnHeadersDefaultCellStyle.Font     = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248, 250, 252);
        grid.EnableHeadersVisualStyles = false;
        return grid;
    }

    // ── Public refresh — called by TrayApplicationContext on file notify ──────

    /// <summary>
    /// Called by FileSystemWatcher when the agent writes racko-notify.json.
    /// Reloads the inbox in real time without any user interaction.
    /// </summary>
    public void RefreshInbox()
    {
        // Only reload if the inbox tab is currently visible
        if (_tabs.SelectedIndex == 0)
            _ = LoadInboxAsync();
        // If on outbox tab, reload inbox silently in background
        // so it's fresh when user switches back
        else
            _ = Task.Run(async () =>
            {
                await Task.Delay(500); // brief delay to let S3 settle
                if (_inboxGrid.IsHandleCreated)
                    _inboxGrid.BeginInvoke(() => _ = LoadInboxAsync());
            });
    }

    // ── Load data ──────────────────────────────────────────────────────────────

    private async Task LoadInboxAsync()
    {
        ShowStatus("Loading received files…");
        try
        {
            var files = await _api.ListInboxAsync();
            _inboxGrid.Columns.Clear();
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 240, DataPropertyName = "FileName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "From",        Width = 150, DataPropertyName = "SourceMachineName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared",      Width = 140, DataPropertyName = "CreatedAtFormatted" });
            _inboxGrid.AutoGenerateColumns = false;
            _inboxGrid.DataSource = files.Select(f => new InboxRow(f)).ToList();

            ShowGrid(inbox: true, empty: !files.Any(),
                emptyMsg: "No files shared with this VM yet.\nDouble-click a row to open or download.");
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
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn   { HeaderText = "File Name",   Width = 230, DataPropertyName = "FileName" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn   { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn   { HeaderText = "Shared With", Width = 100, DataPropertyName = "SharedWithCount" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn   { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel" });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn   { HeaderText = "Uploaded",    Width = 140, DataPropertyName = "CreatedAtFormatted" });

            // Delete button column
            var deleteCol = new DataGridViewButtonColumn
            {
                HeaderText    = "",
                Text          = "Delete",
                UseColumnTextForButtonValue = true,
                Width         = 70,
                FlatStyle     = FlatStyle.Flat,
                Name          = "DeleteCol",
            };
            _outboxGrid.Columns.Add(deleteCol);

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

        using var dlg = new UploadForm(machines) { Owner = this };
        if (dlg.ShowDialog() != DialogResult.OK) return;

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

    // ── Inbox: permission-based action ─────────────────────────────────────────

    private async Task OnInboxDoubleClickAsync(int rowIndex)
    {
        if (_inboxGrid.DataSource is not List<InboxRow> rows || rowIndex >= rows.Count) return;
        var file = rows[rowIndex].File;

        ViewUrlResponse viewUrl;
        try { viewUrl = await _api.GetViewUrlAsync(file.Id); }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not load file URL:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        if (viewUrl.Permission == "full")
        {
            // Full control → download directly from S3 via presigned URL
            // API is NOT in the data path — bytes go S3 → HttpClient → disk
            using var save = new SaveFileDialog
            {
                FileName         = file.FileName,
                InitialDirectory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
            };
            if (save.ShowDialog(this) != DialogResult.OK) return;

            try
            {
                using var http     = new System.Net.Http.HttpClient();
                using var response = await http.GetAsync(
                    viewUrl.PresignedUrl,
                    System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();

                await using var fs = File.Create(save.FileName);
                await response.Content.CopyToAsync(fs);

                MessageBox.Show($"Saved to:\n{save.FileName}",
                    "Racko — Downloaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Download failed:\n{ex.Message}",
                    "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        else
        {
            // Read only → open in embedded WebView2 viewer
            // File streams S3 → Chromium engine — never written to disk
            var viewer = new RackoApp.Views.FileViewerForm(viewUrl.PresignedUrl, file.FileName)
            {
                Owner = this,
            };
            viewer.Show();
        }
    }

    // ── Outbox: manage dialog (double-click) ───────────────────────────────────

    private void OnOutboxDoubleClick(int rowIndex)
    {
        if (_outboxGrid.DataSource is not List<OutboxRow> rows || rowIndex >= rows.Count) return;
        var file = rows[rowIndex].File;
        using var dlg = new ManageForm(file, _api) { Owner = this };
        if (dlg.ShowDialog() == DialogResult.OK) _ = LoadOutboxAsync();
    }

    // ── Outbox: delete button click ────────────────────────────────────────────

    private async Task OnOutboxCellClickAsync(int rowIndex, int colIndex)
    {
        if (_outboxGrid.DataSource is not List<OutboxRow> rows || rowIndex >= rows.Count) return;

        // Only handle the Delete button column
        var col = _outboxGrid.Columns[colIndex];
        if (col?.Name != "DeleteCol") return;

        var file = rows[rowIndex].File;

        var confirm = MessageBox.Show(
            $"Permanently delete '{file.FileName}'?\nThis will remove it from S3 storage and all target VMs. This cannot be undone.",
            "Racko — Confirm Delete",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

        if (confirm != DialogResult.Yes) return;

        try
        {
            await _api.DeleteAsync(file.Id);
            MessageBox.Show("File deleted successfully.", "Racko",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            _ = LoadOutboxAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Delete failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private void ShowStatus(string msg)
    {
        _statusLabel.Text        = msg;
        _statusLabel.Visible     = true;
        _inboxGrid.Visible       = false;
        _outboxGrid.Visible      = false;
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
