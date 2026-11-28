using System.Threading;

namespace Teyza.Admin.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var single = new Mutex(true, @"Local\TeyzaAdminDesktop", out bool first);
        if (!first)
        {
            MessageBox.Show("Teyza Admin is already running. Return to its open window.", "Teyza Admin",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        try { Application.Run(new AdminWindow()); }
        finally { single.ReleaseMutex(); }
    }
}
