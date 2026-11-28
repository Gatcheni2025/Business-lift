using Teyza.Admin.Windows;

int count = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception("FAILED: " + name);
    Console.WriteLine("PASS: " + name);
    count++;
}
foreach (var url in new[] { "https://teyza.co.za/admin", "https://teyza.co.za/admin.html",
    "https://www.teyza.co.za/admin/index.html", "https://teyza.co.za/admin-payments.html",
    "https://teyza.co.za/admin/#acquisition" })
    Check(NavigationPolicy.IsAdminPage(url), "Admin route " + url);
foreach (var url in new[] { "http://teyza.co.za/admin", "https://teyza.co.za.evil.test/admin",
    "https://teyza.co.za@evil.test/admin", "https://evil.test/admin",
    "https://teyza.co.za:8443/admin", "https://teyza.co.za/for-shop-owners.html",
    "https://teyza.co.za/admin-unreviewed.html", "https://teyza.co.za/admin/../../pay",
    "file:///C:/test.html", "about:blank", "javascript:alert(1)" })
    Check(!NavigationPolicy.IsAdminPage(url), "Blocked Admin navigation " + url);
foreach (var url in new[] { "https://web.whatsapp.com/send?phone=27000000000&text=Test%20only",
    "https://wa.me/27000000000?text=Test", "https://www.google.com/maps/search/?api=1",
    "https://workplace.zoho.com/", "https://teyza.co.za/assets/admin-benefits/teyza-benefits-spaza-v1.png",
    "https://example.com/" })
    Check(NavigationPolicy.TryExternal(url, out _), "External HTTPS link");
foreach (var url in new[] { "file:///C:/Windows/system32/cmd.exe", "ms-settings:", "whatsapp://send",
    "http://example.com", "javascript:alert(1)", "data:text/html,test",
    "https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://a.local/",
    "https://a.internal/", "https://example.com:1234/", "https://user@example.com/" })
    Check(!NavigationPolicy.TryExternal(url, out _), "Blocked external link");
Check(NavigationPolicy.IsBlank("about:blank") && NavigationPolicy.IsBlank("") &&
      !NavigationPolicy.IsBlank("about:blank#other"), "Deferred blank popup");
Check(NavigationPolicy.CanSave("https://teyza.co.za/assets/admin-benefits/teyza-benefits-spaza-v1.png","benefits.png"), "Approved PNG");
Check(NavigationPolicy.CanSave("blob:https://teyza.co.za/synthetic-id","statement.pdf"), "Trusted blob PDF");
Check(!NavigationPolicy.CanSave("https://evil.test/file.png","file.png"), "Cross-origin download rejected");
Check(!NavigationPolicy.CanSave("https://teyza.co.za/file.exe","file.exe"), "Executable download rejected");
Check(!NavigationPolicy.CanSave("blob:https://evil.test/id","file.pdf"), "Cross-origin blob rejected");
Console.WriteLine(count + " navigation and download policy tests passed. No live requests made.");
