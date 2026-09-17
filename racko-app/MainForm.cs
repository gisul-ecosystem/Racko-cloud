using System.Drawing;
using System.IO;
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

    private TabControl   _tabs             = null!;
    private DataGridView _inboxGrid        = null!;
    private DataGridView _outboxGrid       = null!;
    private Label        _statusLabel      = null!;
    private Button       _bulkDeleteBtn    = null!;
    private CheckBox     _selectAllChk     = null!;
    private Button       _bulkDownloadBtn  = null!;
    private CheckBox     _inboxSelectAllChk = null!;

    public MainForm(AgentConfig config)
    {
        _api = new RackoApiClient(config);
        BuildUI();
        _ = LoadInboxAsync();
    }

    // ── Build UI ───────────────────────────────────────────────────────────

    private void BuildUI()
    {
        Text          = "Racko Shared Files";
        Size          = new Size(980, 600);
        MinimumSize   = new Size(700, 460);
        BackColor     = Surface;
        StartPosition = FormStartPosition.CenterScreen;
        Font          = new Font("Segoe UI", 9f);

        // ── Header ────────────────────────────────────────────────────────
        var header = new Panel { Dock = DockStyle.Top, Height = 52, BackColor = Color.White };
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
        uploadBtn.FlatAppearance.BorderSize         = 0;
        uploadBtn.FlatAppearance.MouseOverBackColor = Color.FromArgb(160, 23, 23);
        uploadBtn.Anchor   = AnchorStyles.Top | AnchorStyles.Right;
        uploadBtn.Location = new Point(header.Width - 160, 11);
        uploadBtn.Click   += async (_, _) => await OnUploadClickAsync();
        header.SizeChanged += (_, _) => uploadBtn.Left = header.Width - 160;
        header.Controls.AddRange(new Control[] { logo, uploadBtn });

        // ── Status label ──────────────────────────────────────────────────
        _statusLabel = new Label
        {
            Dock      = DockStyle.Fill,
            Text      = "Loading…",
            ForeColor = TextMute,
            Font      = new Font("Segoe UI", 10f),
            TextAlign = ContentAlignment.MiddleCenter,
            Visible   = true,
        };

        // ── Tabs ──────────────────────────────────────────────────────────
        _tabs = new TabControl
        {
            Dock    = DockStyle.Fill,
            Padding = new Point(12, 6),
            Font    = new Font("Segoe UI", 9f),
        };

        var inboxPage  = new TabPage("↓  Received");
        var outboxPage = new TabPage("↑  Sent");

        _inboxGrid  = BuildGrid(multiSelect: true);
        _outboxGrid = BuildGrid(multiSelect: true);

        _inboxGrid.CellDoubleClick  += (_, e) => { if (e.RowIndex >= 0) _ = OnInboxDoubleClickAsync(e.RowIndex); };
        _inboxGrid.SelectionChanged += (_, _) => UpdateBulkDownloadButton();
        _outboxGrid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OnOutboxDoubleClick(e.RowIndex); };
        _outboxGrid.CellClick       += (_, e) => { if (e.RowIndex >= 0) _ = OnOutboxCellClickAsync(e.RowIndex, e.ColumnIndex); };
        _outboxGrid.CellValueChanged += (_, _) => UpdateBulkDeleteButton();
        _outboxGrid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (_outboxGrid.IsCurrentCellDirty)
                _outboxGrid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };

        // ── Outbox toolbar ────────────────────────────────────────────────
        _selectAllChk = new CheckBox
        {
            Text     = "Select All",
            AutoSize = true,
            Font     = new Font("Segoe UI", 9f),
            Left     = 4, Top = 4,
            Cursor   = Cursors.Hand,
        };
        _selectAllChk.CheckedChanged += OnSelectAllChanged;

        _bulkDeleteBtn = new Button
        {
            Text      = "Delete Selected (0)",
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            Height    = 26, Width = 160,
            Cursor    = Cursors.Hand,
            Enabled   = false,
            BackColor = Color.FromArgb(254, 242, 242),
            ForeColor = Color.FromArgb(220, 38, 38),
        };
        _bulkDeleteBtn.FlatAppearance.BorderColor = Color.FromArgb(252, 202, 202);
        _bulkDeleteBtn.Click += async (_, _) => await OnBulkDeleteClickAsync();

        var outboxToolbar = new Panel
        {
            Dock = DockStyle.Top, Height = 32,
            BackColor = Color.White, Padding = new Padding(2),
        };
        outboxToolbar.Controls.Add(_selectAllChk);
        outboxToolbar.Controls.Add(_bulkDeleteBtn);
        _bulkDeleteBtn.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        outboxToolbar.SizeChanged += (_, _) =>
            _bulkDeleteBtn.Left = outboxToolbar.Width - _bulkDeleteBtn.Width - 4;
        _bulkDeleteBtn.Top = 3;

        outboxPage.Controls.Add(_outboxGrid);
        outboxPage.Controls.Add(outboxToolbar);

        // ── Inbox toolbar ─────────────────────────────────────────────────
        _inboxSelectAllChk = new CheckBox
        {
            Text     = "Select All",
            AutoSize = true,
            Font     = new Font("Segoe UI", 9f),
            Left     = 4, Top = 4,
            Cursor   = Cursors.Hand,
        };
        _inboxSelectAllChk.CheckedChanged += OnInboxSelectAllChanged;

        _bulkDownloadBtn = new Button
        {
            Text      = "↓ Download Selected (0)",
            FlatStyle = FlatStyle.Flat,
            Font      = new Font("Segoe UI", 9f),
            Height    = 26, Width = 190,
            Cursor    = Cursors.Hand,
            Enabled   = false,
            BackColor = Color.FromArgb(240, 249, 255),
            ForeColor = Color.FromArgb(29, 78, 216),
        };
        _bulkDownloadBtn.FlatAppearance.BorderColor = Color.FromArgb(147, 197, 253);
        _bulkDownloadBtn.Click += async (_, _) => await OnBulkDownloadClickAsync();

        var inboxToolbar = new Panel
        {
            Dock = DockStyle.Top, Height = 32,
            BackColor = Color.White, Padding = new Padding(2),
        };
        inboxToolbar.Controls.Add(_inboxSelectAllChk);
        inboxToolbar.Controls.Add(_bulkDownloadBtn);
        _bulkDownloadBtn.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        inboxToolbar.SizeChanged += (_, _) =>
            _bulkDownloadBtn.Left = inboxToolbar.Width - _bulkDownloadBtn.Width - 4;
        _bulkDownloadBtn.Top = 3;

        inboxPage.Controls.Add(_inboxGrid);
        inboxPage.Controls.Add(inboxToolbar);

        _tabs.TabPages.Add(inboxPage);
        _tabs.TabPages.Add(outboxPage);
        _tabs.SelectedIndexChanged += (_, _) =>
        {
            if (_tabs.SelectedIndex == 0) _ = LoadInboxAsync();
            else                          _ = LoadOutboxAsync();
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
        grid.DefaultCellStyle.SelectionBackColor     = Color.FromArgb(254, 242, 242);
        grid.DefaultCellStyle.SelectionForeColor     = Color.FromArgb(15, 23, 42);
        grid.ColumnHeadersDefaultCellStyle.Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248, 250, 252);
        grid.EnableHeadersVisualStyles               = false;
        return grid;
    }

    // ── Public refresh — called by TrayApplicationContext on notify file ───

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

    // ── Load data ──────────────────────────────────────────────────────────

    private async Task LoadInboxAsync()
    {
        ShowStatus("Loading received files…");
        try
        {
            var files = await _api.ListInboxAsync();
            _inboxGrid.Columns.Clear();
            _inboxGrid.ReadOnly = true;
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",  Width = 240, DataPropertyName = "FileName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "From",       Width = 160, DataPropertyName = "SourceMachineName" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission", Width = 120, DataPropertyName = "PermissionLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",       Width =  90, DataPropertyName = "SizeLabel" });
            _inboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared",     Width = 140, DataPropertyName = "CreatedAtFormatted" });
            _inboxGrid.AutoGenerateColumns = false;
            _inboxGrid.DataSource = files.Select(f => new InboxRow(f)).ToList();

            if (_inboxSelectAllChk != null) _inboxSelectAllChk.Checked = false;
            UpdateBulkDownloadButton();

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

            _outboxGrid.Columns.Add(new DataGridViewCheckBoxColumn
                { HeaderText = "", Width = 32, Name = "SelectCol", ReadOnly = false });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "File Name",   Width = 210, DataPropertyName = "FileName",          ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Permission",  Width = 120, DataPropertyName = "PermissionLabel",    ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Shared With", Width = 100, DataPropertyName = "SharedWithCount",    ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Size",        Width =  90, DataPropertyName = "SizeLabel",          ReadOnly = true });
            _outboxGrid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Uploaded",    Width = 140, DataPropertyName = "CreatedAtFormatted", ReadOnly = true });
            _outboxGrid.AutoGenerateColumns = false;
            _outboxGrid.DataSource = files.Select(f => new OutboxRow(f)).ToList();

            if (_selectAllChk != null) _selectAllChk.Checked = false;
            UpdateBulkDeleteButton();

            ShowGrid(inbox: false, empty: !files.Any(),
                emptyMsg: "You have not shared any files yet.\nClick 'Upload & Share' to get started.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    // ── Select All helpers ─────────────────────────────────────────────────

    private void OnInboxSelectAllChanged(object? s, EventArgs e)
    {
        if (_inboxGrid.Rows.Count == 0) return;
        bool select = _inboxSelectAllChk.Checked;
        if (select) _inboxGrid.SelectAll(); else _inboxGrid.ClearSelection();
        _inboxSelectAllChk.Text = select ? "Deselect All" : "Select All";
    }

    private void UpdateBulkDownloadButton()
    {
        int count = _inboxGrid.SelectedRows.Count;
        _bulkDownloadBtn.Text    = $"↓ Download Selected ({count})";
        _bulkDownloadBtn.Enabled = count > 0;

        if (_inboxGrid.Rows.Count > 0)
        {
            bool allSelected = count == _inboxGrid.Rows.Count;
            _inboxSelectAllChk.CheckedChanged -= OnInboxSelectAllChanged;
            _inboxSelectAllChk.Checked = allSelected;
            _inboxSelectAllChk.Text    = allSelected ? "Deselect All" : "Select All";
            _inboxSelectAllChk.CheckedChanged += OnInboxSelectAllChanged;
        }
    }

    // ── Upload ─────────────────────────────────────────────────────────────

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
                    "Racko — Not in Group", MessageBoxButtons.OK, MessageBoxIcon.Information);
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

        // UploadForm handles file/folder picking + folder zipping (with inline progress bar).
        using var dlg = new UploadForm(machines) { Owner = this };
        if (dlg.ShowDialog() != DialogResult.OK) return;

        var entries    = dlg.SelectedEntries;
        var permission = dlg.SelectedPermission;
        var machineIds = dlg.SelectedMachineIds;

        if (entries.Count == 0) return;

        // ── Show ProgressForm for the S3 upload phase ──────────────────────
        // Upload entries sequentially so the progress bar is meaningful.
        // Total bytes known up-front → we can show a grand-total bar.
        long totalBytes = entries.Sum(e => new FileInfo(e.FilePath).Length);

        using var progressForm = new ProgressForm(
            entries.Count == 1
                ? $"Uploading  {entries[0].DisplayName}"
                : $"Uploading  {entries.Count} files");

        progressForm.Show(this);
        Application.DoEvents(); // ensure the form paints before heavy work starts

        long grandTotal     = totalBytes;
        long grandDone      = 0;
        int  filesDone      = 0;
        var  failed         = new List<string>();
        var  ct             = progressForm.CancellationToken;

        try
        {
            foreach (var entry in entries)
            {
                ct.ThrowIfCancellationRequested();

                var entrySize   = new FileInfo(entry.FilePath).Length;
                var entryStart  = grandDone;     // bytes before this file started
                var displayName = entry.DisplayName;

                progressForm.SetPhase(
                    entries.Count == 1
                        ? "Uploading…"
                        : $"Uploading  {displayName}  ({filesDone + 1} of {entries.Count})");

                // IProgress<long> reports bytes PUT for this individual file.
                // We add entryStart to get the running grand total.
                var uploadProgress = new Progress<long>(bytesSent =>
                {
                    long overall = entryStart + bytesSent;
                    progressForm.SetProgress(overall, grandTotal);
                });

                try
                {
                    await _api.UploadAsync(
                        entry.FilePath, permission, machineIds,
                        displayFileName: displayName,
                        uploadProgress:  uploadProgress,
                        ct:              ct);

                    grandDone += entrySize;
                    filesDone++;
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    failed.Add($"{displayName}: {ex.Message}");
                    grandDone += entrySize; // still advance grand total so bar doesn't stall
                    filesDone++;
                }
                finally
                {
                    if (entry.TempZipPath is not null)
                        try { File.Delete(entry.TempZipPath); } catch { }
                }
            }

            progressForm.MarkComplete(
                failed.Count == 0
                    ? $"Uploaded {filesDone} file{(filesDone != 1 ? "s" : "")} successfully."
                    : $"Uploaded {filesDone - failed.Count} of {filesDone} file(s).");
        }
        catch (OperationCanceledException)
        {
            // Clean up any remaining temp zips
            foreach (var e in entries)
                if (e.TempZipPath is not null)
                    try { File.Delete(e.TempZipPath); } catch { }

            progressForm.MarkError("Upload cancelled.");
        }

        // Wait for user to dismiss ProgressForm (they click Close)
        while (!progressForm.IsDisposed && progressForm.Visible)
        {
            await Task.Delay(100);
            Application.DoEvents();
        }

        if (failed.Count > 0)
        {
            MessageBox.Show(
                $"Uploaded {filesDone - failed.Count} of {entries.Count} file(s).\n\nFailed:\n{string.Join("\n", failed)}",
                "Racko — Partial Upload", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        _ = LoadOutboxAsync();
    }

    // ── Bulk download (Inbox) ──────────────────────────────────────────────

    private async Task OnBulkDownloadClickAsync()
    {
        if (_inboxGrid.DataSource is not List<InboxRow> rows) return;

        var selected = _inboxGrid.SelectedRows
            .Cast<DataGridViewRow>()
            .Select(r => rows[r.Index].File)
            .ToList();

        if (selected.Count == 0) return;

        var fullControl = selected.Where(f => f.Permission == "full").ToList();
        var readOnly    = selected.Where(f => f.Permission != "full").ToList();

        if (fullControl.Count == 0)
        {
            MessageBox.Show(
                "None of the selected files can be downloaded.\nOnly files with Full Control permission support download.",
                "Racko — Cannot Download", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (readOnly.Count > 0)
        {
            var skippedNames = string.Join("\n  • ", readOnly.Select(f => f.FileName));
            var proceed = MessageBox.Show(
                $"{readOnly.Count} file{(readOnly.Count != 1 ? "s are" : " is")} read-only and will be skipped:\n  • {skippedNames}\n\n" +
                $"Download the remaining {fullControl.Count} file{(fullControl.Count != 1 ? "s" : "")}?",
                "Racko — Mixed Permissions", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (proceed != DialogResult.Yes) return;
        }

        const string downloadDir = @"C:\Racko Shared Files";
        Directory.CreateDirectory(downloadDir);

        // ── Show ProgressForm ──────────────────────────────────────────────
        using var progressForm = new ProgressForm(
            fullControl.Count == 1
                ? $"Downloading  {fullControl[0].FileName}"
                : $"Downloading  {fullControl.Count} files");

        progressForm.Show(this);
        Application.DoEvents();

        var failed = new List<string>();
        var ct     = progressForm.CancellationToken;

        try
        {
            for (int i = 0; i < fullControl.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var file = fullControl[i];

                progressForm.SetPhase(
                    fullControl.Count == 1
                        ? "Downloading…"
                        : $"Downloading  {file.FileName}  ({i + 1} of {fullControl.Count})");
                progressForm.SetProgress(i, fullControl.Count); // file-count progress until we know size

                try
                {
                    var viewUrl = await _api.GetViewUrlAsync(file.Id);

                    if (file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    {
                        await DownloadAndExtractFolderAsync(
                            file, viewUrl.PresignedUrl, downloadDir,
                            progressForm, ct);
                    }
                    else
                    {
                        await DownloadFileAsync(
                            file, viewUrl.PresignedUrl, downloadDir,
                            progressForm, ct);
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    failed.Add($"{file.FileName}: {ex.Message}");
                }
            }

            progressForm.MarkComplete(
                failed.Count == 0
                    ? $"Saved to {downloadDir}"
                    : $"Downloaded {fullControl.Count - failed.Count} of {fullControl.Count} file(s).");
        }
        catch (OperationCanceledException)
        {
            progressForm.MarkError("Download cancelled.");
        }

        while (!progressForm.IsDisposed && progressForm.Visible)
        {
            await Task.Delay(100);
            Application.DoEvents();
        }

        UpdateBulkDownloadButton();

        if (failed.Count > 0)
        {
            MessageBox.Show(
                $"Downloaded {fullControl.Count - failed.Count} of {fullControl.Count} file(s).\n\nFailed:\n{string.Join("\n", failed)}",
                "Racko — Partial Download", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // ── Inbox: permission-based action (double-click) ──────────────────────

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
            const string downloadDir = @"C:\Racko Shared Files";
            Directory.CreateDirectory(downloadDir);

            using var progressForm = new ProgressForm(
                file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)
                    ? $"Installing  {Path.GetFileNameWithoutExtension(file.FileName)}"
                    : $"Downloading  {file.FileName}");

            progressForm.Show(this);
            Application.DoEvents();

            var ct = progressForm.CancellationToken;

            try
            {
                if (file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    await DownloadAndExtractFolderAsync(
                        file, viewUrl.PresignedUrl, downloadDir, progressForm, ct);
                }
                else
                {
                    await DownloadFileAsync(
                        file, viewUrl.PresignedUrl, downloadDir, progressForm, ct);
                }

                progressForm.MarkComplete(
                    file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)
                        ? $"Extracted to {downloadDir}"
                        : $"Saved to {Path.Combine(downloadDir, file.FileName)}");
            }
            catch (OperationCanceledException)
            {
                progressForm.MarkError("Cancelled.");
            }
            catch (Exception ex)
            {
                progressForm.MarkError($"Failed: {ex.Message}");
            }

            while (!progressForm.IsDisposed && progressForm.Visible)
            {
                await Task.Delay(100);
                Application.DoEvents();
            }
        }
        else
        {
            var viewer = new FileViewerForm(viewUrl.PresignedUrl, file.FileName) { Owner = this };
            viewer.Show();
        }
    }

    // ── Download helpers ───────────────────────────────────────────────────

    /// <summary>
    /// Download a plain file directly from S3 presigned URL with progress.
    /// </summary>
    private static async Task DownloadFileAsync(
        SharedFileDto  file,
        string         presignedUrl,
        string         destDir,
        ProgressForm   progressForm,
        CancellationToken ct)
    {
        progressForm.SetPhase("Downloading…");
        progressForm.SetProgress(0, file.SizeBytes);

        var destPath = Path.Combine(destDir, file.FileName);

        using var http     = new System.Net.Http.HttpClient();
        using var response = await http.GetAsync(
            presignedUrl,
            System.Net.Http.HttpCompletionOption.ResponseHeadersRead,
            ct);
        response.EnsureSuccessStatusCode();

        var reportedTotal = file.SizeBytes > 0
            ? file.SizeBytes
            : response.Content.Headers.ContentLength ?? 0;

        var bytesProg = new Progress<long>(b =>
            progressForm.SetProgress(b, reportedTotal));

        await using var responseStream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileOut        = File.Create(destPath);
        await using var tracked        = new ProgressStream(fileOut, bytesProg);

        await responseStream.CopyToAsync(tracked, ct);
    }

    /// <summary>
    /// Download a folder zip from S3, then extract it — two distinct progress phases.
    /// Phase 1: Downloading  (bytes received / total bytes)
    /// Phase 2: Extracting…  (bytes unzipped / total uncompressed bytes)
    /// </summary>
    private static async Task DownloadAndExtractFolderAsync(
        SharedFileDto  file,
        string         presignedUrl,
        string         destDir,
        ProgressForm   progressForm,
        CancellationToken ct)
    {
        var tempZip = Path.Combine(Path.GetTempPath(), $"racko_{Guid.NewGuid():N}.zip");

        try
        {
            // ── Phase 1: Download ───────────────────────────────────────────
            progressForm.SetPhase("Downloading…");
            progressForm.SetProgress(0, file.SizeBytes);

            using var http     = new System.Net.Http.HttpClient();
            using var response = await http.GetAsync(
                presignedUrl,
                System.Net.Http.HttpCompletionOption.ResponseHeadersRead,
                ct);
            response.EnsureSuccessStatusCode();

            var reportedTotal = file.SizeBytes > 0
                ? file.SizeBytes
                : response.Content.Headers.ContentLength ?? 0;

            var dlProg = new Progress<long>(b =>
                progressForm.SetProgress(b, reportedTotal));

            await using (var responseStream = await response.Content.ReadAsStreamAsync(ct))
            await using (var tempFs         = File.Create(tempZip))
            await using (var tracked        = new ProgressStream(tempFs, dlProg))
            {
                await responseStream.CopyToAsync(tracked, ct);
            } // all streams flushed and closed — file handle fully released

            // ── Phase 2: Extract ────────────────────────────────────────────
            progressForm.SetPhase("Extracting…");
            progressForm.SetProgress(0, 0); // indeterminate briefly until ZipProgress reads entry sizes

            var extractProg = new Progress<(long done, long total)>(t =>
                progressForm.SetProgress(t.done, t.total));

            await Task.Run(() =>
                ZipProgress.ExtractToDirectoryAsync(tempZip, destDir, extractProg, ct),
                ct);
        }
        finally
        {
            try { File.Delete(tempZip); } catch { }
        }
    }

    // ── Outbox ─────────────────────────────────────────────────────────────

    private void OnOutboxDoubleClick(int rowIndex)
    {
        if (_outboxGrid.DataSource is not List<OutboxRow> rows || rowIndex >= rows.Count) return;
        using var dlg = new ManageForm(rows[rowIndex].File, _api) { Owner = this };
        if (dlg.ShowDialog() == DialogResult.OK) _ = LoadOutboxAsync();
    }

    private async Task OnOutboxCellClickAsync(int rowIndex, int colIndex)
    {
        await Task.CompletedTask;
    }

    // ── Select All for Outbox ──────────────────────────────────────────────

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

    // ── Bulk delete ────────────────────────────────────────────────────────

    private async Task OnBulkDeleteClickAsync()
    {
        var ids = GetSelectedFileIds();
        if (!ids.Any()) return;

        var confirm = MessageBox.Show(
            $"Permanently delete {ids.Count} file{(ids.Count != 1 ? "s" : "")}?\nThis will remove them from S3 storage and all target VMs. This cannot be undone.",
            "Racko — Confirm Bulk Delete", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

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

    // ── Helpers ────────────────────────────────────────────────────────────

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
    public SharedFileDto File             => file;
    public string FileName               => file.FileName;
    public string SourceMachineName      => file.SourceMachineName;
    public string PermissionLabel        => file.PermissionLabel;
    public string SizeLabel              => file.SizeLabel;
    public string CreatedAtFormatted     => Fmt(file.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy HH:mm") : s;
}

public class OutboxRow(SharedFileDto file)
{
    public SharedFileDto File             => file;
    public string FileName               => file.FileName;
    public string PermissionLabel        => file.PermissionLabel;
    public string SharedWithCount        => $"{file.SharedWithMachineIds.Length} VM(s)";
    public string SizeLabel              => file.SizeLabel;
    public string CreatedAtFormatted     => Fmt(file.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy HH:mm") : s;
}
