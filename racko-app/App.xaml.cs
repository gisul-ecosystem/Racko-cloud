using System.IO;
using System.Windows;
using System.Windows.Forms; // NotifyIcon lives here
using RackoApp.Services;

// Explicit alias to avoid ambiguity with System.Windows.Forms.MessageBox
using WpfMessageBox = System.Windows.MessageBox;

namespace RackoApp;

public partial class App : System.Windows.Application
{
    private NotifyIcon?   _trayIcon;
    private MainWindow?   _mainWindow;
    private AgentConfig?  _config;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Load agent config — show error and exit if not installed yet
        try
        {
            _config = AgentConfig.Load();
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show(
                $"Cannot read Racko Agent config:\n{ex.Message}\n\nMake sure the Racko Agent is installed and running.",
                "Racko — Error", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown();
            return;
        }

        // Build tray icon
        BuildTrayIcon();

        // Open main window
        ShowMainWindow();
    }

    // ── Tray Icon ──────────────────────────────────────────────────────────

    private void BuildTrayIcon()
    {
        _trayIcon = new NotifyIcon
        {
            Text    = "Racko Shared Files",
            Visible = true,
            Icon    = LoadTrayIcon(),
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open Shared Files", null, (_, _) => ShowMainWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => { _trayIcon.Visible = false; Shutdown(); });

        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (_, _) => ShowMainWindow();
    }

    private static System.Drawing.Icon LoadTrayIcon()
    {
        // Try to load the bundled icon; fall back to system default
        try
        {
            var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "racko-tray.ico");
            if (File.Exists(iconPath))
                return new System.Drawing.Icon(iconPath);
        }
        catch { /* fall through */ }
        return System.Drawing.SystemIcons.Application;
    }

    // ── Main Window ────────────────────────────────────────────────────────

    private void ShowMainWindow()
    {
        if (_mainWindow is { IsLoaded: true })
        {
            _mainWindow.Show();
            _mainWindow.WindowState = WindowState.Normal;
            _mainWindow.Activate();
            return;
        }

        _mainWindow = new MainWindow(_config!);
        // Hide to tray instead of closing when user clicks X
        _mainWindow.Closing += (_, args) =>
        {
            args.Cancel = true;
            _mainWindow.Hide();
        };
        _mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        base.OnExit(e);
    }
}
