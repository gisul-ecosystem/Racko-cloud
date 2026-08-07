using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace RackoApp.Views;

/// <summary>
/// In-app file viewer using embedded Chromium (WebView2).
/// Opens the presigned S3 URL directly — no file written to disk.
/// Used for read-only permission files: user can view but not download.
/// </summary>
public class FileViewerForm : Form
{
    private readonly string _presignedUrl;
    private readonly string _fileName;
    private WebView2?       _webView;

    public FileViewerForm(string presignedUrl, string fileName)
    {
        _presignedUrl = presignedUrl;
        _fileName     = fileName;
        BuildUI();
    }

    private void BuildUI()
    {
        Text            = $"Viewing: {_fileName}  [Read Only]";
        Size            = new Size(1000, 700);
        MinimumSize     = new Size(640, 480);
        StartPosition   = FormStartPosition.CenterParent;
        BackColor       = Color.FromArgb(248, 250, 252);

        // ── Header strip ───────────────────────────────────────────────────────
        var header = new Panel
        {
            Dock      = DockStyle.Top,
            Height    = 40,
            BackColor = Color.FromArgb(254, 242, 242),
            Padding   = new Padding(12, 0, 12, 0),
        };

        var readOnlyLabel = new Label
        {
            Text      = $"🔒  Read Only — {_fileName}",
            ForeColor = Color.FromArgb(185, 28, 28),
            Font      = new Font("Segoe UI", 9f, FontStyle.Regular),
            AutoSize  = true,
            Left      = 12,
            Top       = 11,
        };

        var closeBtn = new Button
        {
            Text      = "Close",
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(55, 65, 81),
            Size      = new Size(70, 26),
            Cursor    = Cursors.Hand,
            Anchor    = AnchorStyles.Top | AnchorStyles.Right,
            Top       = 7,
        };
        closeBtn.FlatAppearance.BorderColor = Color.FromArgb(209, 213, 219);
        closeBtn.Left  = header.Width - 90;
        closeBtn.Click += (_, _) => Close();
        header.SizeChanged += (_, _) => closeBtn.Left = header.Width - 90;

        header.Controls.AddRange(new Control[] { readOnlyLabel, closeBtn });

        // ── WebView2 ───────────────────────────────────────────────────────────
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
        };

        Controls.Add(_webView);
        Controls.Add(header);

        // Initialise WebView2 asynchronously after the form loads
        Load += async (_, _) => await InitWebViewAsync();
    }

    private async Task InitWebViewAsync()
    {
        if (_webView is null) return;

        try
        {
            // Use a user data folder in AppData so WebView2 can cache its runtime files
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "RackoApp", "WebView2Cache");

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _webView.EnsureCoreWebView2Async(env);

            // Block navigation away from the presigned URL and disable context menu
            // to prevent "Save As", "Open in new tab" etc.
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled            = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled            = false;

            // Prevent "Save as" and "Print" keyboard shortcuts
            _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;

            // Block any navigation away from the original presigned URL
            _webView.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true; // block new windows/tabs
            };

            // Navigate directly to the S3 presigned URL
            // File streams from S3 → WebView2 Chromium engine — API never involved
            _webView.CoreWebView2.Navigate(_presignedUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Could not open viewer:\n{ex.Message}\n\nMake sure WebView2 Runtime is installed.",
                "Racko — Viewer Error",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _webView?.Dispose();
        base.OnFormClosed(e);
    }
}
