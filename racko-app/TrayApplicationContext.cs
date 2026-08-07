using System.Drawing;
using System.IO;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp;

/// <summary>
/// Runs the app as a system tray icon — no main window on startup.
/// Watches C:\ProgramData\racko-agent\racko-notify.json written by the
/// Go agent when a shared_file_added/updated/deleted WS event arrives.
/// On change → calls MainForm.RefreshInbox() in real time.
/// </summary>
public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon        _tray;
    private readonly AgentConfig       _config;
    private          MainForm?         _mainForm;
    private          FileSystemWatcher? _watcher;

    // Written by the Go agent when a shared-file WebSocket event arrives
    private static readonly string NotifyFile =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "racko-agent", "racko-notify.json");

    public TrayApplicationContext(AgentConfig config)
    {
        _config = config;

        _tray = new NotifyIcon
        {
            Text    = "Racko Shared Files",
            Visible = true,
            Icon    = LoadIcon(),
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Shared Files", null, (_, _) => ShowMainForm());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => ExitApp());

        _tray.ContextMenuStrip = menu;
        _tray.DoubleClick     += (_, _) => ShowMainForm();

        // Start watching for real-time notifications from the agent
        StartFileWatcher();

        // Show window on first launch
        ShowMainForm();
    }

    // ── FileSystemWatcher — real-time inbox refresh ────────────────────────

    private void StartFileWatcher()
    {
        try
        {
            var dir = Path.GetDirectoryName(NotifyFile)!;
            if (!Directory.Exists(dir)) return;

            _watcher = new FileSystemWatcher(dir, Path.GetFileName(NotifyFile))
            {
                NotifyFilter          = NotifyFilters.LastWrite | NotifyFilters.Size,
                EnableRaisingEvents   = true,
                IncludeSubdirectories = false,
            };

            // Fires when the agent writes/updates the trigger file
            _watcher.Changed += OnNotifyFileChanged;
            _watcher.Created += OnNotifyFileChanged;
        }
        catch
        {
            // Non-fatal — app still works, just no real-time updates
        }
    }

    private void OnNotifyFileChanged(object sender, FileSystemEventArgs e)
    {
        // FileSystemWatcher fires on a thread-pool thread — marshal to UI thread
        if (_mainForm is { IsHandleCreated: true, IsDisposed: false })
        {
            _mainForm.BeginInvoke(() => _mainForm.RefreshInbox());
        }
    }

    // ── Main Form ──────────────────────────────────────────────────────────

    private void ShowMainForm()
    {
        if (_mainForm is { IsDisposed: false })
        {
            _mainForm.Show();
            _mainForm.WindowState = FormWindowState.Normal;
            _mainForm.BringToFront();
            return;
        }

        _mainForm = new MainForm(_config);
        _mainForm.FormClosing += (_, args) =>
        {
            if (args.CloseReason == CloseReason.UserClosing)
            {
                args.Cancel = true;
                _mainForm.Hide();
            }
        };
        _mainForm.Show();
    }

    private void ExitApp()
    {
        _watcher?.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _watcher?.Dispose();
            _tray.Dispose();
        }
        base.Dispose(disposing);
    }

    private static System.Drawing.Icon LoadIcon()
    {
        try
        {
            var asm    = typeof(TrayApplicationContext).Assembly;
            var stream = asm.GetManifestResourceStream("RackoApp.Assets.racko.ico");
            if (stream != null) return new System.Drawing.Icon(stream);
        }
        catch { }
        return SystemIcons.Application;
    }
}
