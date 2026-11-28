# Teyza Admin for Windows 1.0.0 — QA candidate

This separate Windows x64 desktop shell displays the existing production Admin dashboard at https://teyza.co.za/admin. It is **not** a browser-installed PWA, a duplicate backend, an offline database or a new administrator identity. Dashboard changes appear when the live website is opened or manually reloaded. Existing server permissions, password login, five-minute session checks, and consent checks remain authoritative. The host never reloads automatically.

## Build
On a supported Windows x64 machine, use .NET 10 SDK, ImageMagick (for the existing Teyza SVG icon) and optionally Inno Setup 6. Run the reviewed Build-Windows.ps1 script from this directory with -Installer for an installer. It uses the official NuGet source, pinned Microsoft WebView2 SDK, policy tests, self-contained .NET publish and SHA-256 artifact manifest. Microsoft's installed Evergreen WebView2 Runtime is required. No Firebase credentials or signing keys are needed by this build.

## Security and behaviour
- Only the existing HTTPS Admin routes are allowed inside the primary dashboard. HTTPS external links open in the user's default browser; non-HTTPS and custom schemes are blocked. No native host-object bridge, JavaScript injection, password capture, permission grants, relaxed TLS, remote debugging flags, automatic startup, background updater or auto-sending.
- Use an isolated InPrivate WebView2 profile, with password/autofill saving disabled. Closing the app ends the local browser session. Existing backend session expiry/revocation is not replaced. Minimize/switch away conceals the dashboard; the website's existing visibility-based security checks remain in control. Acquisition may resume in the same valid session, other sensitive views may refresh or clear as on the website.
- User-initiated blank popups preserve the reviewed site's asynchronous permission check before opening WhatsApp, and support the existing in-memory seller statement print flow. No external link opens before the page actually navigates the popup. Temporary review windows close after five minutes or with the main window; inactive views are concealed. Normal HTTPS links open separately and do not replace the Admin workspace. No guarantees that WhatsApp preserves URL text or automatically attaches media; copy, paste and manual attachment remain supported.
- File downloads from the Teyza origin (or its blob URLs) prompt for a destination; the shell never auto-executes files. Do not save sensitive evidence on a shared machine.
- The setup is a per-user x64 Windows install, no admin elevation or automatic start. Start menu entry, optional desktop icon and standard uninstall. The installer does not install WebView2 or change security settings; if missing, the app points to the official Microsoft page.

## Acceptance before distribution
The CI build and synthetic policy tests do not log in, send messages, issue Google Places searches or deploy Firebase. Before a production installer is approved, test on an authorised Windows PC:
1. Start menu/desktop shortcut, maximize/restore, high-DPI, offline error and manual reload.
2. Existing authorised email/password login, unauthorised account refusal, lock/logout after five minutes, session revocation and closing/reopening. No saved password or persisted Admin login.
3. Real dashboard modules (Command Centre, seller approvals, support, finance, user roles), with private document and statement viewing/printing and no data changes solely for QA.
4. National discovery (including the previously empty Northern Cape and not-yet-tested Eastern Cape), category-specific artwork, copy/download, opening WhatsApp Web, returning to the same active search and no automatic sends.
5. External-link blocking (file, non-HTTPS, custom scheme, foreign embedded navigation), no native bridge, save/cancel and no automatic execution. Test actual WebView2 focus/visibility and temporary popup behavior.
6. Review artifact SHA-256 and Microsoft Defender results; sign installer and executable with the organisation's approved Authenticode process before wider distribution. Do not disable Windows protections for a QA build. Uninstall and reinstall.

No live backend, Hosting, payment or app-store changes. No production installer signature or Windows GUI acceptance has been established by the source commit. CI artifacts are private unsigned QA candidates only, not an approved public release.
