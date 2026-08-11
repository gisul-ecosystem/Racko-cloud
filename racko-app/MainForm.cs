using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Windows.Forms;
using RackoApp.Services;
using RackoApp.Views;
 
namespace RackoApp;

public class MainForm : Form
{
    private static readonly Color Brand    = Color.FromArgb(185, 28, 28);
    private static readonly Color Surface  = Color.FromArgb(248, 250, 252);
    private static readonly Color TextMute = Color.FromArgb(100, 116, 139);

    private readonly RackoApiClient _api;

    private TabControl   _tabs          = null!;
    private DataGridView _inboxGrid     = null!;
    private DataGridView _outboxGrid    = null!;
    private Label        _statusLabel   = null!;
    private Button       _bulkDeleteBtn = null!;   // Delete Selected button
    private CheckBox     _selectAllChk  = null!;   // Select All checkbox for outbox

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
        Size            = new Size(980, 600);
        MinimumSize     = new Size(700, 460);
        BackColor       = Surface;
        StartPosition   = FormStartPosition.CenterScreen;
        Font            = new Font("Segoe UI", 9f);

        // ── Header ────────────────────────────────────────────────────────────
        var header = new Panel
        {
            Dock      = DockStyle.Top,
            Height    = 52,
            BackColor = Color.White,
        };
        header.Paint += (_, e) =>
            e.Graphics.DrawLine(new Pen(Color.FromArgb(226, 232, 240)),
                0, header.Height - 1, header.Width, header.Height - 1);

        var logo = new Label
        {
            Text     = "● Racko Shared Files",
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
        uploadBtn.FlatAppearance.BorderSize         = 0;
        uploadBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(160, 23, 23);
        uploadBtn.Anchor   = AnchorStyles.Top | AnchorStyles.Right;
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

        _inboxGrid  = BuildGrid(multiSelect: false);
        _outboxGrid = BuildGrid(multiSelect: true);

        _inboxGrid.CellDoubleClick  += (_, e) => { if (e.RowIndex >= 0) _ = OnInboxDoubleClickAsync(e.RowIndex); };
        _outboxGrid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OnOutboxDoubleClick(e.RowIndex); };
        _outboxGrid.CellClick       += (_, e) => { if (e.RowIndex >= 0) _ = OnOutboxCellClickAsync(e.RowIndex, e.ColumnIndex); };
        _outboxGrid.CellValueChanged += (_, _) => UpdateBulkDeleteButton();
        _outboxGrid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (_outboxGrid.IsCurrentCellDirty) _outboxGrid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };

        // ── Outbox toolbar: Select All + Delete Selected ──────────────────────
        _selectAllChk = new CheckBox
        {
            Text      = "Select All",
            AutoSize  = true,
            Font      = new Font("Segoe UI", 9f),
            Left      = 4,
            Top       = 4,
            Cursor    = Cursors.Hand,
        };
        _selectAllChk.CheckedChanged += OnSelectAllChanged;

        _bulkDeleteBtn = new Button
        {
            Text      = "Delete Selected (0)",
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            Height    = 26,
            Width     = 160,
            Cursor    = Cursors.Hand,
            Enabled   = false,
            BackColor = Color.FromArgb(254, 242, 242),
            ForeColor = Color.FromArgb(220, 38, 38),
        };
        _bulkDeleteBtn.FlatAppearance.BorderColor = Color.FromArgb(252, 202, 202);
        _bulkDeleteBtn.Click += async (_, _) => await OnBulkDeleteClickAsync();

        var outboxToolbar = new Panel
        {
            Dock      = DockStyle.Top,
            Height    = 32,
            BackColor = Color.White,
            Padding   = new Padding(2),
        };
        outboxToolbar.Controls.Add(_selectAllChk);
        outboxToolbar.Controls.Add(_bulkDeleteBtn);
        _bulkDeleteBtn.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        outboxToolbar.SizeChanged += (_, _) => _bulkDeleteBtn.Left = outboxToolbar.Width - _bulkDeleteBtn.Width - 4;
        _bulkDeleteBtn.Top = 3;

        outboxPage.Controls.Add(_outboxGrid);
        outboxPage.Controls.Add(outboxToolbar);
        inboxPage.Controls.Add(_inboxGrid);

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

    private static DataGridView BuildGrid(bool multiSelect)
    {
        var grid = new DataGridView
        {
            Dock                        = DockStyle.Fill,
            ReadOnly                    = false,
            AllowUserToAddRows          = false,
            AllowUserToDeleteRows       = false,
            SelectionMode               = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect                 = multiSelect,
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

    // ── Public refresh — called by TrayApplicationContext on file notify ───────

    public void RefreshInbox()
    {
        if (_tabs.SelectedIndex == 0)
            _ = LoadInboxAsync();
        else
            _ = Task.Run(async () =>
            {
                await Task.Delay(500);
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
            _inboxGrid.ReadOnly = true;
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 240, DataPropertyName = "FileName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "From",        Width = 160, DataPropertyName = "SourceMachineName" });
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

            // Checkbox column for bulk selection
            var chkCol = new DataGridViewCheckBoxColumn
            {
                HeaderText = "",
                Width      = 32,
                Name       = "SelectCol",
                ReadOnly   = false,
            };
            _outboxGrid.Columns.Add(chkCol);
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 210, DataPropertyName = "FileName",          ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel",    ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared With", Width = 100, DataPropertyName = "SharedWithCount",    ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel",          ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Uploaded",    Width = 140, DataPropertyName = "CreatedAtFormatted", ReadOnly = true });
            _outboxGrid.AutoGenerateColumns = false;
            _outboxGrid.DataSource = files.Select(f => new OutboxRow(f)).ToList();

            // Reset Select All state
            if (_selectAllChk != null) _selectAllChk.Checked = false;
            UpdateBulkDeleteButton();

            ShowGrid(inbox: false, empty: !files.Any(),
                emptyMsg: "You have not shared any files yet.\nClick 'Upload & Share' to get started.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    // ── Select All for Outbox ─────────────────────────────────────────────────

    private void OnSelectAllChanged(object? s, EventArgs e)
    {
        if (_outboxGrid.Rows.Count == 0) return;
        bool check = _selectAllChk.Checked;
        foreach (DataGridViewRow row in _outboxGrid.Rows)
        {
            if (row.Cells["SelectCol"] is DataGridViewCheckBoxCell cell)
                cell.Value = check;
        }
        _outboxGrid.RefreshEdit();
        _outboxGrid.EndEdit();
        UpdateBulkDeleteButton();
    }

    private void UpdateBulkDeleteButton()
    {
        int count = GetSelectedFileIds().Count;
        _bulkDeleteBtn.Text    = $"Delete Selected ({count})";
        _bulkDeleteBtn.Enabled = count > 0;
    }

    private List<string> GetSelectedFileIds()
    {
        var ids = new List<string>();
        if (_outboxGrid.DataSource is not List<OutboxRow> rows) return ids;
        foreach (DataGridViewRow row in _outboxGrid.Rows)
        {
            if (row.Cells["SelectCol"]?.Value is true)
                ids.Add(rows[row.Index].File.Id);
        }
        return ids;
    }

    // ── Upload ─────────────────────────────────────────────────────────────────

    private async Task OnUploadClickAsync()
    {
        IReadOnlyList<MachineDto> machines;
        try
        {
            var (list, inGroup) = await _api.ListMachinesAsync();
            if (!inGroup)
            {
                MessageBox.Show(
                    "This machine is not assigned to any group.\n\nPlease ask your admin to add it to a group before sharing files.",
                    "Racko — Not in Group",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            machines = list;
        }
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
            // For folder uploads SelectedDisplayName is set to "FolderName.zip"
            // so the inbox/outbox shows the original folder name instead of the temp uuid zip name.
            await _api.UploadAsync(
                dlg.SelectedFilePath,
                dlg.SelectedPermission,
                dlg.SelectedMachineIds,
                dlg.SelectedDisplayName);

            var displayName = dlg.SelectedDisplayName ?? Path.GetFileName(dlg.SelectedFilePath);
            MessageBox.Show(
                $"'{displayName}' shared with {dlg.SelectedMachineIds.Length} VM(s).",
                "Racko — Uploaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
            _ = LoadOutboxAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Upload failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            // Clean up temp zip created for folder uploads
            if (dlg.TempZipPath is not null)
                try { File.Delete(dlg.TempZipPath); } catch { }
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
            // Auto-save to C:\Racko Shared Files\ — created if it doesn't exist.
            // If the file is a .zip (folder upload), extract it as a folder instead.
            const string downloadDir = @"C:\Racko Shared Files";
            try
            {
                Directory.CreateDirectory(downloadDir);

                if (file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    // Download zip to a temp file then extract — preserves full folder structure
                    var tempZip = Path.Combine(Path.GetTempPath(), $"racko_{Guid.NewGuid():N}.zip");
                    try
                    {
                        using var http     = new System.Net.Http.HttpClient();
                        using var response = await http.GetAsync(
                            viewUrl.PresignedUrl,
                            System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
                        response.EnsureSuccessStatusCode();

                        await using var fs = File.Create(tempZip);
                        await response.Content.CopyToAsync(fs);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Download failed:\n{ex.Message}",
                            "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        try { File.Delete(tempZip); } catch { }
                        return;
                    }

                    // Extract — ZipFile preserves full nested folder structure
                    try
                    {
                        ZipFile.ExtractToDirectory(tempZip, downloadDir, overwriteFiles: true);
                        var folderName = Path.GetFileNameWithoutExtension(file.FileName);
                        MessageBox.Show(
                            $"Folder extracted to:\n{Path.Combine(downloadDir, folderName)}",
                            "Racko — Downloaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Extraction failed:\n{ex.Message}",
                            "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                    finally
                    {
                        try { File.Delete(tempZip); } catch { }
                    }
                }
                else
                {
                    // Regular file — save directly
                    var destPath = Path.Combine(downloadDir, file.FileName);
                    using var http     = new System.Net.Http.HttpClient();
                    using var response = await http.GetAsync(
                        viewUrl.PresignedUrl,
                        System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
                    response.EnsureSuccessStatusCode();

                    await using var fs = File.Create(destPath);
                    await response.Content.CopyToAsync(fs);

                    MessageBox.Show(
                        $"Saved to:\n{destPath}",
                        "Racko — Downloaded", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Download failed:\n{ex.Message}",
                    "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        else
        {
            var viewer = new FileViewerForm(viewUrl.PresignedUrl, file.FileName) { Owner = this };
            viewer.Show();
        }
    }

    // ── Outbox: manage dialog (double-click) ───────────────────────────────────

    private void OnOutboxDoubleClick(int rowIndex)
    {
        if (_outboxGrid.DataSource is not List<OutboxRow> rows || rowIndex >= rows.Count) return;
        using var dlg = new ManageForm(rows[rowIndex].File, _api) { Owner = this };
        if (dlg.ShowDialog() == DialogResult.OK) _ = LoadOutboxAsync();
    }

    // ── Outbox: single-row delete button (kept for the DeleteCol) ─────────────

    private async Task OnOutboxCellClickAsync(int rowIndex, int colIndex)
    {
        // The DeleteCol is gone — checkbox column now. No single-delete button.
        // Single delete is via double-click → ManageForm → Delete button.
        await Task.CompletedTask;
    }

    // ── Bulk delete ────────────────────────────────────────────────────────────

    private async Task OnBulkDeleteClickAsync()
    {
        var ids = GetSelectedFileIds();
        if (!ids.Any()) return;

        var confirm = MessageBox.Show(
            $"Permanently delete {ids.Count} file{(ids.Count != 1 ? "s" : "")}?\nThis will remove them from S3 storage and all target VMs. This cannot be undone.",
            "Racko — Confirm Bulk Delete",
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

        if (confirm != DialogResult.Yes) return;

        _bulkDeleteBtn.Enabled = false;
        _bulkDeleteBtn.Text    = "Deleting…";

        var failed = new List<string>();
        await Task.WhenAll(ids.Select(async id =>
        {
            try { await _api.DeleteAsync(id); }
            catch { lock (failed) { failed.Add(id); } }
        }));

        if (failed.Any())
        {
            MessageBox.Show(
                $"Deleted {ids.Count - failed.Count} file(s). {failed.Count} failed.",
                "Racko — Partial Success", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        else
        {
            MessageBox.Show(
                $"{ids.Count} file{(ids.Count != 1 ? "s" : "")} deleted successfully.",
                "Racko", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        _ = LoadOutboxAsync();
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
