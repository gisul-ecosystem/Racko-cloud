using System.Windows;
using RackoApp.Services;

// Explicit aliases — both WPF and WinForms are in scope due to UseWindowsForms=true
using WpfCheckBox   = System.Windows.Controls.CheckBox;
using WpfMessageBox = System.Windows.MessageBox;

namespace RackoApp.Views;

public partial class ManageDialog : Window
{
    private readonly SharedFileDto  _file;
    private readonly RackoApiClient _api;

    public ManageDialog(SharedFileDto file, RackoApiClient api)
    {
        InitializeComponent();
        _file = file;
        _api  = api;

        TitleText.Text    = $"Manage: {file.FileName}";
        FileInfoText.Text = $"{file.FileName}  ·  {file.SizeLabel}  ·  uploaded {TryFormat(file.CreatedAt)}";

        switch (file.Permission)
        {
            case "read-write": PermReadWrite.IsChecked = true; break;
            case "full":       PermFull.IsChecked      = true; break;
            default:           PermRead.IsChecked      = true; break;
        }

        Loaded += async (_, _) => await LoadVmsAsync();
    }

    private async Task LoadVmsAsync()
    {
        try
        {
            var machines = await _api.ListMachinesAsync();
            VmList.ItemsSource = machines;

            // Pre-check VMs already shared with once the visual tree is ready
            await Dispatcher.InvokeAsync(() =>
            {
                foreach (var machine in machines)
                {
                    var container = VmList.ItemContainerGenerator.ContainerFromItem(machine)
                        as System.Windows.FrameworkElement;
                    var cb = FindVisualChild<WpfCheckBox>(container);
                    if (cb is not null)
                        cb.IsChecked = _file.SharedWithMachineIds.Contains(machine.Id);
                }
            }, System.Windows.Threading.DispatcherPriority.Loaded);
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Could not load VM list:\n{ex.Message}",
                "Racko", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async void OnSaveClick(object sender, RoutedEventArgs e)
    {
        var permission = PermReadWrite.IsChecked == true ? "read-write"
                       : PermFull.IsChecked      == true ? "full"
                       : "read";
        var ids = GetCheckedIds();

        try
        {
            await _api.UpdateShareAsync(_file.Id, permission, ids);
            DialogResult = true;
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Update failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void OnDeleteClick(object sender, RoutedEventArgs e)
    {
        var confirm = WpfMessageBox.Show(
            $"Permanently delete '{_file.FileName}'?\nThis cannot be undone.",
            "Racko — Confirm Delete",
            MessageBoxButton.YesNo, MessageBoxImage.Warning);

        if (confirm != MessageBoxResult.Yes) return;

        try
        {
            await _api.DeleteAsync(_file.Id);
            DialogResult = true;
        }
        catch (Exception ex)
        {
            WpfMessageBox.Show($"Delete failed:\n{ex.Message}",
                "Racko — Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OnCancelClick(object sender, RoutedEventArgs e) => DialogResult = false;

    private string[] GetCheckedIds()
    {
        if (VmList.ItemsSource is not IEnumerable<MachineDto> machines) return [];
        var ids = new List<string>();
        foreach (var machine in machines)
        {
            var container = VmList.ItemContainerGenerator.ContainerFromItem(machine)
                as System.Windows.FrameworkElement;
            var cb = FindVisualChild<WpfCheckBox>(container);
            if (cb?.IsChecked == true) ids.Add(machine.Id);
        }
        return [.. ids];
    }

    private static T? FindVisualChild<T>(System.Windows.DependencyObject? parent)
        where T : System.Windows.DependencyObject
    {
        if (parent is null) return null;
        for (int i = 0; i < System.Windows.Media.VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            var child = System.Windows.Media.VisualTreeHelper.GetChild(parent, i);
            if (child is T found) return found;
            var result = FindVisualChild<T>(child);
            if (result is not null) return result;
        }
        return null;
    }

    private static string TryFormat(string s) =>
        DateTime.TryParse(s, out var d) ? d.ToLocalTime().ToString("dd MMM yyyy") : s;
}
