namespace Teyza.Admin.Windows;

// The shell does not use API keys, native credential storage, JavaScript injection,
// host objects, or any native bridge callable by remote content.
internal static class NavigationPolicy
{
    internal const string StartUrl = "https://teyza.co.za/admin";
    internal const string RuntimeHelp = "https://developer.microsoft.com/en-us/microsoft-edge/webview2/";
    private static readonly HashSet<string> AdminPaths = new(StringComparer.Ordinal)
    {
        "/admin", "/admin/", "/admin.html", "/admin/index.html",
        "/admin-review.html", "/admin-sellers.html", "/admin-login.html",
        "/admin-dashboard.html", "/admin-payments.html", "/admin-support.html", "/admin-users.html"
    };
    private static readonly HashSet<string> DownloadExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".csv", ".xlsx", ".txt"
    };
    internal static bool IsTrustedOrigin(Uri? uri) =>
        uri is not null && uri.IsAbsoluteUri && uri.Scheme == Uri.UriSchemeHttps &&
        uri.IsDefaultPort && uri.UserInfo.Length == 0 &&
        (uri.IdnHost == "teyza.co.za" || uri.IdnHost == "www.teyza.co.za");
    internal static bool IsAdminPage(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && IsTrustedOrigin(uri) &&
        AdminPaths.Contains(uri.AbsolutePath);
    internal static bool IsBlank(string? url) =>
        string.IsNullOrEmpty(url) || url == "about:blank";
    internal static bool TryExternal(string? url, out Uri? uri)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out uri) &&
            uri.Scheme == Uri.UriSchemeHttps && uri.UserInfo.Length == 0 &&
            uri.IsDefaultPort && !uri.IsLoopback && uri.HostNameType == UriHostNameType.Dns &&
            uri.IdnHost.Contains('.') && !uri.IdnHost.EndsWith('.') &&
            !uri.IdnHost.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) &&
            !uri.IdnHost.EndsWith(".local", StringComparison.OrdinalIgnoreCase) &&
            !uri.IdnHost.EndsWith(".internal", StringComparison.OrdinalIgnoreCase))
            return true;
        uri = null;
        return false;
    }
    internal static bool CanSave(string? url, string? fileName)
    {
        if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(fileName)) return false;
        if (url.StartsWith("blob:", StringComparison.Ordinal)) url = url[5..];
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
            IsTrustedOrigin(uri) && DownloadExtensions.Contains(Path.GetExtension(fileName));
    }
}
