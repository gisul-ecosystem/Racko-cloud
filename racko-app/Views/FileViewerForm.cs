using System.Drawing;
using System.Net;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace RackoApp.Views;

/// <summary>
/// In-app file viewer using embedded Chromium (WebView2).
///
/// File type routing (read-only permission):
///   Office files (docx, xlsx, pptx, etc.) → Microsoft Office Online Viewer 
///       URL: https://view.officeapps.live.com/op/view.aspx?src=&lt;presignedUrl&gt;
///       Microsoft fetches the file from S3 server-side — zero server memory.
///       Strictly read-only — uses /op/view.aspx not /op/edit.aspx.
///   Browser-renderable (PDF, images, text, HTML, video, audio) → direct S3 URL
///   Unknown types → "Preview not available" message panel (no download button)
/// </summary>
public class FileViewerForm : Form
{
    private readonly string _presignedUrl;
    private readonly string _fileName;
    private WebView2?       _webView;

    // ── Office file extensions handled by Office Online Viewer ────────────────
    private static readonly HashSet<string> OfficeExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".doc", ".docx", ".docm",
        ".xls", ".xlsx", ".xlsm", ".xlsb",
        ".ppt", ".pptx", ".pptm",
        ".odt", ".ods", ".odp",
        ".rtf",
    };

    // ── Extensions WebView2 (Chromium) can render natively ───────────────────
    private static readonly HashSet<string> BrowserRenderableExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf",
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico",
        ".txt", ".csv", ".json", ".xml", ".html", ".htm", ".md",
        ".mp4", ".webm", ".ogv",
        ".mp3", ".wav", ".ogg", ".m4a",
    };

    public FileViewerForm(string presignedUrl, string fileName)
    {
        _presignedUrl = presignedUrl;
        _fileName     = fileName;
        BuildUI();
    }

    private void BuildUI()
    {
        Text            = $"Viewing: {_fileName}  [Read Only]";
        Size            = new Size(1100, 750);
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

        var ext = Path.GetExtension(_fileName);

        if (OfficeExtensions.Contains(ext) || BrowserRenderableExtensions.Contains(ext))
        {
            // ── WebView2 for Office + browser-renderable files ─────────────────
            _webView = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(_webView);
            Load += async (_, _) => await InitWebViewAsync();
        }
        else
        {
            // ── Unsupported file type — "Preview not available" panel ──────────
            var noPreview = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = Color.FromArgb(248, 250, 252),
            };

            var icon = new Label
            {
                Text      = "📄",
                Font      = new Font("Segoe UI", 36f),
                AutoSize  = true,
                ForeColor = Color.FromArgb(148, 163, 184),
            };
            icon.Location = new Point(
                (ClientSize.Width  - icon.PreferredWidth)  / 2,
                (ClientSize.Height - 120) / 2);

            var msg = new Label
            {
                Text      = $"Preview not available for {ext.ToUpperInvariant()} files.",
                Font      = new Font("Segoe UI", 11f),
                AutoSize  = true,
                ForeColor = Color.FromArgb(100, 116, 139),
            };
            msg.Location = new Point(
                (ClientSize.Width - msg.PreferredWidth) / 2,
                icon.Location.Y + icon.PreferredHeight + 12);

            var sub = new Label
            {
                Text      = "The file is stored securely. Ask the sender to share with Full Control permission to download it.",
                Font      = new Font("Segoe UI", 9f),
                AutoSize  = false,
                Width     = ClientSize.Width - 80,
                TextAlign = ContentAlignment.MiddleCenter,
                ForeColor = Color.FromArgb(148, 163, 184),
            };
            sub.Location = new Point(40, msg.Location.Y + msg.PreferredHeight + 8);

            noPreview.Controls.AddRange(new Control[] { icon, msg, sub });
            noPreview.Resize += (_, _) =>
            {
                icon.Location = new Point((noPreview.Width  - icon.PreferredWidth)  / 2, (noPreview.Height - 120) / 2);
                msg.Location  = new Point((noPreview.Width  - msg.PreferredWidth)   / 2, icon.Location.Y + icon.PreferredHeight + 12);
                sub.Width     = noPreview.Width - 80;
                sub.Location  = new Point(40, msg.Location.Y + msg.PreferredHeight + 8);
            };
            Controls.Add(noPreview);
        }

        Controls.Add(header);
    }

    private async Task InitWebViewAsync()
    {
        if (_webView is null) return;

        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "RackoApp", "WebView2Cache");

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _webView.EnsureCoreWebView2Async(env);

            // Disable all browser UI that could allow saving or editing
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled  = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled             = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled             = false;
            _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;

            // Block new windows (e.g. Office Online "Open in Desktop App" links)
            _webView.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
            };

            var ext = Path.GetExtension(_fileName);
            string navigateUrl;

            if (OfficeExtensions.Contains(ext))
            {
                // ── Office Online Viewer ───────────────────────────────────────
                // Microsoft fetches the file from the presigned S3 URL server-side.
                // Strictly read-only viewer (/op/view.aspx, not /op/edit.aspx).
                // The presigned URL must be URL-encoded as a query parameter.
                var encodedSrc = WebUtility.UrlEncode(_presignedUrl);
                navigateUrl = $"https://view.officeapps.live.com/op/view.aspx?src={encodedSrc}";
            }
            else
            {
                // ── Direct S3 URL — browser-native rendering ───────────────────
                navigateUrl = _presignedUrl;
            }

            _webView.CoreWebView2.Navigate(navigateUrl);
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
