using System.Drawing;
using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp;

/// <summary>
/// Runs the app as a system tray icon — no main window on startup.
/// Double-click or menu → "Open" shows the main form.
/// Runs on Win10/11/Server 2016/2019/2022 — no Desktop Experience needed.
/// </summary>
public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon    _tray;
    private readonly AgentConfig   _config;
    private          MainForm?     _mainForm;

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

        // Show the window on first launch
        ShowMainForm();
    }

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
        // Hide to tray instead of closing
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
        _tray.Visible = false;
        _tray.Dispose();
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _tray.Dispose();
        base.Dispose(disposing);
    }

    private static Icon LoadIcon()
    {
        try
        {
            // Embedded resource — always present in the single-file exe
            var asm    = typeof(TrayApplicationContext).Assembly;
            var stream = asm.GetManifestResourceStream("RackoApp.Assets.racko.ico");
            if (stream != null) return new Icon(stream);
        }
        catch { /* fall through */ }
        return SystemIcons.Application;
    }
}
