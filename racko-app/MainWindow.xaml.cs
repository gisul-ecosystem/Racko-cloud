using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using RackoApp.Services;
using RackoApp.Views;

// Alias to disambiguate WPF vs WinForms types used in same project
using WpfMessageBox = System.Windows.MessageBox;

namespace RackoApp;

public partial class MainWindow : Window
{
    private readonly RackoApiClient _api;
    private bool _showingInbox = true;

    public MainWindow(AgentConfig config)
    {
        InitializeComponent();
        _api = new RackoApiClient(config);
        _ = LoadInboxAsync();
    }

    // ── Tab switching ──────────────────────────────────────────────────────

    private void OnTabInboxClick(object sender, RoutedEventArgs e)
    {
        if (_showingInbox) return;
        _showingInbox = true;
        TabInboxBtn.Style  = (Style)FindResource("TabButtonActive");
        TabOutboxBtn.Style = (Style)FindResource("TabButton");
        _ = LoadInboxAsync();
    }

    private void OnTabOutboxClick(object sender, RoutedEventArgs e)
    {
        if (!_showingInbox) return;
        _showingInbox = false;
        TabOutboxBtn.Style = (Style)FindResource("TabButtonActive");
        TabInboxBtn.Style  = (Style)FindResource("TabButton");
        _ = LoadOutboxAsync();
    }

    private void OnRefreshClick(object sender, RoutedEventArgs e) =>
        _ = _showingInbox ? LoadInboxAsync() : LoadOutboxAsync();

    // ── Load data ──────────────────────────────────────────────────────────

    private async Task LoadInboxAsync()
    {
        ShowStatus("Loading received files…");
        try
        {
            var files = await _api.ListInboxAsync();
            InboxGrid.ItemsSource = files.Select(f => new InboxRow(f)).ToList();
            ShowPanel(inbox: true, empty: !files.Any(), emptyMsg: "No files shared with this VM yet.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    private async Task LoadOutboxAsync()
    {
        ShowStatus("Loading sent files…");
        try
        {
            var files = await _api.ListOutboxAsync();
            OutboxGrid.ItemsSource = files.Select(f => new OutboxRow(f)).ToList();
            ShowPanel(inbox: false, empty: !files.Any(), emptyMsg: "You have not shared any files yet.\nUse 'Upload & Share' to get started.");
        }
        catch (Exception ex) { ShowStatus($"Error: {ex.Message}"); }
    }

    // ── Upload ─────────────────────────────────────────────────────────────

    private async void OnUploadClick(object sender, RoutedEventArgs e)
    {
        IReadOnlyList<MachineDto> machines;
        try { machines = await _api.ListMachinesAsync(); }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Could not load VM list:\n{ex.Message}",
                "Racko", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var dlg = new UploadDialog(machines) { Owner = this };
        if (dlg.ShowDialog() != true) return;

        try
        {
            await _api.UploadAsync(dlg.SelectedFilePath, dlg.SelectedPermission, dlg.SelectedMachineIds);
            WpfMessageBox.Show(
                $"'{Path.GetFileName(dlg.SelectedFilePath)}' shared with {dlg.SelectedMachineIds.Length} VM(s).",
                "Racko — Uploaded", MessageBoxButton.OK, MessageBoxImage.Information);
            _ = LoadOutboxAsync();
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Upload failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ── Row interactions ───────────────────────────────────────────────────

    private async void OnInboxRowDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (InboxGrid.SelectedItem is not InboxRow row) return;
        await DownloadFileAsync(row.File);
    }

    private void OnOutboxRowDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (OutboxGrid.SelectedItem is not OutboxRow row) return;
        OpenManageDialog(row.File);
    }

    private async Task DownloadFileAsync(SharedFileDto file)
    {
        var dlg = new Microsoft.Win32.SaveFileDialog
        {
            FileName         = file.FileName,
            InitialDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
        };
        if (dlg.ShowDialog(this) != true) return;

        try
        {
            var destDir  = Path.GetDirectoryName(dlg.FileName)!;
            var destName = Path.GetFileName(dlg.FileName);
            await _api.DownloadAsync(file.Id, destName, destDir);
            WpfMessageBox.Show($"Saved to:\n{dlg.FileName}",
                "Racko — Downloaded", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Download failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OpenManageDialog(SharedFileDto file)
    {
        var dlg = new ManageDialog(file, _api) { Owner = this };
        if (dlg.ShowDialog() == true) _ = LoadOutboxAsync();
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private void ShowStatus(string msg)
    {
        StatusText.Text        = msg;
        StatusText.Visibility  = Visibility.Visible;
        InboxPanel.Visibility  = Visibility.Collapsed;
        OutboxPanel.Visibility = Visibility.Collapsed;
    }

    private void ShowPanel(bool inbox, bool empty, string emptyMsg)
    {
        if (empty) { ShowStatus(emptyMsg); return; }
        StatusText.Visibility  = Visibility.Collapsed;
        InboxPanel.Visibility  = inbox ? Visibility.Visible   : Visibility.Collapsed;
        OutboxPanel.Visibility = inbox ? Visibility.Collapsed : Visibility.Visible;
    }
}

// ── Row view-models ────────────────────────────────────────────────────────────

public record InboxRow(SharedFileDto File)
{
    public string FileName          => File.FileName;
    public string SourceMachineName => File.SourceMachineName;
    public string PermissionLabel   => File.PermissionLabel;
    public string SizeLabel         => File.SizeLabel;
    public string CreatedAt         => Fmt(File.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy, HH:mm") : s;
}

public record OutboxRow(SharedFileDto File)
{
    public string FileName        => File.FileName;
    public string PermissionLabel => File.PermissionLabel;
    public string SharedWithCount => $"{File.SharedWithMachineIds.Length} VM(s)";
    public string SizeLabel       => File.SizeLabel;
    public string CreatedAt       => Fmt(File.CreatedAt);
    static string Fmt(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy, HH:mm") : s;
}
