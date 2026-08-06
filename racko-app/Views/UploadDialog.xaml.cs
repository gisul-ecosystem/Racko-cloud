using System.Windows;
using RackoApp.Services;

// Explicit aliases — both WPF and WinForms are in scope due to UseWindowsForms=true
using WpfCheckBox  = System.Windows.Controls.CheckBox;
using WpfMessageBox = System.Windows.MessageBox;

namespace RackoApp.Views;

public partial class UploadDialog : Window
{
    public string   SelectedFilePath  { get; private set; } = "";
    public string   SelectedPermission => PermReadWrite.IsChecked == true ? "read-write"
                                        : PermFull.IsChecked == true      ? "full"
                                        : "read";
    public string[] SelectedMachineIds { get; private set; } = [];

    public UploadDialog(IReadOnlyList<MachineDto> machines)
    {
        InitializeComponent();
        if (!machines.Any())
        {
            NoVmsText.Visibility = Visibility.Visible;
        }
        else
        {
            VmList.ItemsSource = machines;
        }
    }

    private void OnBrowseClick(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Title  = "Select a file to share",
            Filter = "All Files (*.*)|*.*",
        };
        if (dlg.ShowDialog(this) != true) return;

        SelectedFilePath        = dlg.FileName;
        FileNameText.Text       = System.IO.Path.GetFileName(dlg.FileName);
        FileNameText.Foreground = (System.Windows.Media.Brush)FindResource("TextPrimary");
        UploadBtn.IsEnabled     = true;
    }

    private void OnUploadClick(object sender, RoutedEventArgs e)
    {
        // Collect checked VMs by walking the visual tree
        SelectedMachineIds = VmList.Items
            .OfType<MachineDto>()
            .Where(m =>
            {
                var container = VmList.ItemContainerGenerator.ContainerFromItem(m)
                    as System.Windows.FrameworkElement;
                var cb = FindVisualChild<WpfCheckBox>(container);
                return cb?.IsChecked == true;
            })
            .Select(m => m.Id)
            .ToArray();

        if (!SelectedMachineIds.Any())
        {
            WpfMessageBox.Show("Please select at least one VM to share with.",
                "Racko", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        DialogResult = true;
    }

    private void OnCancelClick(object sender, RoutedEventArgs e) => DialogResult = false;

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
}
