using System.Diagnostics;
using System.Drawing;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Teyza.Admin.Windows;

internal sealed class AdminWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly Panel surface = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(241, 247, 245) };
    private readonly Label cover = new()
    {
        Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 12),
        ForeColor = Color.FromArgb(6, 75, 83), Text = "Opening your secure Teyza dashboard..."
    };
    private readonly Label status = new()
    {
        AutoSize = true, ForeColor = Color.White, Margin = new Padding(12, 12, 8, 0),
        Text = "Connecting"
    };
    private readonly List<PopupWindow> popups = new();
    private CoreWebView2Environment? environment;
    private bool ready, closing, failed;

    internal AdminWindow()
    {
        Text = "Teyza Admin";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(850, 600);
        BackColor = Color.FromArgb(241, 247, 245);
        var header = new FlowLayoutPanel
        {
            Dock = DockStyle.Top, Height = 48, WrapContents = false, AutoScroll = true,
            BackColor = Color.FromArgb(6, 75, 83), Padding = new Padding(12, 0, 0, 0)
        };
        header.Controls.Add(new Label
        {
            Text = "TEYZA  |  ADMIN", AutoSize = true, ForeColor = Color.FromArgb(211, 240, 117),
            Font = new Font("Segoe UI", 12, FontStyle.Bold), Margin = new Padding(0, 10, 12, 0)
        });
        header.Controls.Add(ActionButton("Open in browser", (_, _) => OpenExternal(NavigationPolicy.StartUrl)));
        header.Controls.Add(ActionButton("Reload dashboard", (_, _) =>
        {
            if (!ready || view.CoreWebView2 is null) return;
            if (MessageBox.Show(this, "Reload the dashboard? Unsaved search results and drafts may be lost.",
                "Teyza Admin", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            failed = false;
            RefreshPrivacy();
            view.CoreWebView2.Reload();
        }));
        header.Controls.Add(ActionButton("About", (_, _) => MessageBox.Show(this,
            "Teyza Admin for Windows 1.0.0\nLive dashboard: https://teyza.co.za/admin\nSign in with your existing authorised administrator account.\nInternet connection and Microsoft Edge WebView2 Runtime are required.",
            "Teyza Admin", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        header.Controls.Add(status);
        surface.Controls.Add(view);
        surface.Controls.Add(cover);
        Controls.Add(surface);
        Controls.Add(header);
        Activated += (_, _) => QueuePrivacyCheck();
        Deactivate += (_, _) => QueuePrivacyCheck();
        Resize += (_, _) => QueuePrivacyCheck();
        Shown += async (_, _) => await StartAsync();
        FormClosing += (_, _) =>
        {
            closing = true;
            foreach (var popup in popups.ToArray()) popup.Close();
            view.Dispose();
        };
    }

    private static Button ActionButton(string text, EventHandler action)
    {
        var b = new Button { Text = text, AutoSize = true, Height = 32, Margin = new Padding(3, 8, 3, 0),
            FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(13, 94, 102) };
        b.FlatAppearance.BorderSize = 0;
        b.Click += action;
        return b;
    }

    private CoreWebView2ControllerOptions PrivateOptions()
    {
        var options = environment!.CreateCoreWebView2ControllerOptions();
        options.ProfileName = "TeyzaAdmin";
        options.IsInPrivateModeEnabled = true;
        return options;
    }

    private async Task StartAsync()
    {
        try
        {
            // No fixed bundled browser, custom certificates, relaxed browser flags or
            // shared Edge/Chrome profile. Use the installed Evergreen runtime.
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Teyza", "Admin", "WebView2");
            environment = await CoreWebView2Environment.CreateAsync(userDataFolder: folder);
            if (closing) return;
            await view.EnsureCoreWebView2Async(environment, PrivateOptions());
            if (closing) return;
            var core = view.CoreWebView2;
            Configure(core, this);
            core.NavigationStarting += MainNavigation;
            core.NewWindowRequested += NewWindow;
            core.NavigationCompleted += (_, args) =>
            {
                failed = !args.IsSuccess;
                status.Text = failed ? "Connection interrupted" : "Live dashboard";
                if (failed) cover.Text = "The dashboard could not load.\nCheck your internet connection and choose Reload dashboard.";
                RefreshPrivacy();
            };
            core.ProcessFailed += (_, _) =>
            {
                failed = true;
                status.Text = "Browser engine interrupted";
                cover.Text = "The dashboard engine stopped.\nClose and reopen Teyza Admin to reconnect.";
                RefreshPrivacy();
            };
            ready = true;
            RefreshPrivacy();
            core.Navigate(NavigationPolicy.StartUrl);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            status.Text = "WebView2 required";
            cover.Text = "Microsoft Edge WebView2 Runtime is required.\nInstall it from Microsoft's official website and reopen Teyza Admin.";
            if (MessageBox.Show(this, "Open Microsoft's official WebView2 download page?", "Teyza Admin",
                MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                OpenExternal(NavigationPolicy.RuntimeHelp);
        }
        catch
        {
            status.Text = "Dashboard unavailable";
            cover.Text = "Teyza Admin could not initialize.\nCheck the WebView2 Runtime and reopen the app.";
        }
    }

    private void Configure(CoreWebView2 core, Form owner)
    {
        var settings = core.Settings;
        settings.AreHostObjectsAllowed = false;
        settings.IsWebMessageEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = true;
        core.Profile.IsPasswordAutosaveEnabled = false;
        core.Profile.IsGeneralAutofillEnabled = false;
        // The dashboard writes the clipboard on explicit clicks, never reads it.
        // Do not grant native device, location or clipboard-read permissions.
        core.PermissionRequested += (_, args) =>
        {
            args.SavesInProfile = false;
            args.State = CoreWebView2PermissionState.Deny;
            args.Handled = true;
        };
        core.ServerCertificateErrorDetected += (_, args) =>
            args.Action = CoreWebView2ServerCertificateErrorAction.Cancel;
        core.LaunchingExternalUriScheme += (_, args) => args.Cancel = true;
        core.DownloadStarting += async (_, args) =>
        {
            using var deferral = args.GetDeferral();
            try
            {
                args.Handled = true;
                string name = Path.GetFileName(args.ResultFilePath);
                if (!NavigationPolicy.CanSave(args.DownloadOperation.Uri, name))
                {
                    args.Cancel = true;
                    return;
                }
                // Exit the browser event callback before showing a modal window.
                await Task.Yield();
                if (closing || owner.IsDisposed) { args.Cancel = true; return; }
                using var save = new SaveFileDialog
                {
                    FileName = name, Filter = "Original file|*" + Path.GetExtension(name),
                    OverwritePrompt = true, CheckPathExists = true, AddExtension = true,
                    DefaultExt = Path.GetExtension(name).TrimStart('.'), RestoreDirectory = true
                };
                if (save.ShowDialog(owner) != DialogResult.OK ||
                    !NavigationPolicy.CanSave(args.DownloadOperation.Uri, save.FileName) ||
                    !Path.GetExtension(save.FileName).Equals(Path.GetExtension(name), StringComparison.OrdinalIgnoreCase))
                    args.Cancel = true;
                else args.ResultFilePath = save.FileName;
            }
            catch { args.Cancel = true; }
            finally { deferral.Complete(); QueuePrivacyCheck(); }
        };
    }

    private void MainNavigation(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (NavigationPolicy.IsAdminPage(args.Uri)) return;
        args.Cancel = true;
        if (args.IsUserInitiated && NavigationPolicy.IsAdminPage(view.CoreWebView2.Source))
            QueueExternal(args.Uri);
    }

    private async void NewWindow(object? sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        if (closing || !args.IsUserInitiated ||
            !NavigationPolicy.IsAdminPage(view.CoreWebView2.Source) ||
            !NavigationPolicy.IsAdminPage(args.OriginalSourceFrameInfo?.Source)) return;
        if (!NavigationPolicy.IsBlank(args.Uri))
        {
            QueueExternal(args.Uri);
            return;
        }
        // The existing dashboard intentionally opens about:blank synchronously
        // and only navigates after its permission checks. Statement printing also
        // writes an in-memory document to the blank window. Preserve WindowProxy
        // instead of launching WhatsApp prematurely or breaking that flow.
        if (popups.Count >= 3) return;
        using var deferral = args.GetDeferral();
        PopupWindow? popup = null;
        try
        {
            popup = new PopupWindow();
            popups.Add(popup);
            popup.Activated += (_, _) => QueuePrivacyCheck();
            popup.Deactivate += (_, _) => QueuePrivacyCheck();
            popup.FormClosed += (_, _) =>
            {
                popups.Remove(popup);
                QueuePrivacyCheck();
            };
            popup.Show(this);
            await popup.Browser.EnsureCoreWebView2Async(environment!, PrivateOptions());
            if (closing || popup.IsDisposed) return;
            var child = popup.Browser.CoreWebView2;
            Configure(child, popup);
            child.NewWindowRequested += (_, e) => e.Handled = true;
            var handedOff = false;
            child.NavigationStarting += (_, e) =>
            {
                if (NavigationPolicy.IsBlank(e.Uri)) return;
                e.Cancel = true;
                if (handedOff) return;
                handedOff = true;
                QueueExternal(e.Uri, popup);
            };
            child.WindowCloseRequested += (_, _) =>
            {
                if (!popup.IsDisposed) popup.BeginInvoke(new Action(() => popup.Close()));
            };
            child.ProcessFailed += (_, _) =>
            {
                if (!popup.IsDisposed) popup.BeginInvoke(new Action(() => popup.Close()));
            };
            args.NewWindow = child;
            QueuePrivacyCheck();
        }
        catch
        {
            if (popup is not null && !popup.IsDisposed) popup.Close();
        }
        finally { deferral.Complete(); }
    }

    private void QueueExternal(string? url, PopupWindow? popup = null)
    {
        if (closing || IsDisposed || !IsHandleCreated) return;
        BeginInvoke(new Action(() =>
        {
            if (closing) return;
            if (popup is not null && !popup.IsDisposed) popup.Close();
            OpenExternal(url);
        }));
    }
    private void OpenExternal(string? url)
    {
        if (closing) return;
        if (!NavigationPolicy.TryExternal(url, out var uri))
        {
            MessageBox.Show(this, "This link was blocked. Teyza Admin opens only normal HTTPS websites.",
                "Teyza Admin", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        try { Process.Start(new ProcessStartInfo(uri!.AbsoluteUri) { UseShellExecute = true }); }
        catch { MessageBox.Show(this, "Windows could not open your default browser.", "Teyza Admin"); }
    }

    private void QueuePrivacyCheck()
    {
        if (!closing && !IsDisposed && IsHandleCreated)
            BeginInvoke(new Action(RefreshPrivacy));
    }
    private void RefreshPrivacy()
    {
        if (closing || IsDisposed) return;
        var active = Form.ActiveForm;
        bool mainActive = active == this && WindowState != FormWindowState.Minimized;
        // WebView2 visibility is managed by the host; the website itself decides
        // whether its session can resume. Do not inject a simulated user action.
        view.Visible = ready && !failed && mainActive;
        cover.Visible = !view.Visible;
        if (ready && !failed && !mainActive)
            cover.Text = "Teyza Admin is protected while inactive.\nReturn to the window to resume your session.";
        foreach (var popup in popups.ToArray())
            if (!popup.IsDisposed)
                popup.Browser.Visible = active == popup && popup.WindowState != FormWindowState.Minimized;
    }

    private sealed class PopupWindow : Form
    {
        internal readonly WebView2 Browser = new() { Dock = DockStyle.Fill };
        private readonly System.Windows.Forms.Timer lifetime = new() { Interval = 5 * 60 * 1000 };
        internal PopupWindow()
        {
            Text = "Teyza Admin - temporary review / print";
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(850, 650);
            MinimumSize = new Size(420, 300);
            ShowInTaskbar = false;
            BackColor = Color.FromArgb(241, 247, 245);
            Controls.Add(Browser);
            lifetime.Tick += (_, _) => Close();
            lifetime.Start();
            Resize += (_, _) => { if (WindowState == FormWindowState.Minimized) Browser.Visible = false; };
            FormClosed += (_, _) => { lifetime.Stop(); lifetime.Dispose(); Browser.Dispose(); };
        }
    }
}
