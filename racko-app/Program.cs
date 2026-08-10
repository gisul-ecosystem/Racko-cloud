using System.Windows.Forms;
using RackoApp.Services;

namespace RackoApp;

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.SystemAware);

        // Load agent config — show error and exit if not installed yet
        AgentConfig config;
        try
        {
            config = AgentConfig.Load();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Cannot read Racko Agent config:\n{ex.Message}\n\nMake sure the Racko Agent is installed and running.",
                "Racko — Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // Run the app via the tray context — no main window shown on startup
        Application.Run(new TrayApplicationContext(config));
    }
}
