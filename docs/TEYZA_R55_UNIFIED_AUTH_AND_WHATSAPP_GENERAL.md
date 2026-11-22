# Teyza account, storefront and WhatsApp release gates — 1.0.44+55

## Mobile account experience
- One **Sign in to Teyza** entry for existing users, using Google, Facebook or Apple (when supported). Existing email/password users retain a separately expandable legacy sign-in. **No new email/password registrations.**
- **Create an account** presents **Shopper** or **Seller** only. Seller expands to **Spaza Shop Owner**, **Business Owner** or **Wholesaler** before social authentication and then opens the normal seller registration workflow. Selected category is never an approval or a second Firebase identity.
- After existing-UID sign-in, the app checks seller records and approved agent status separately. Only available roles are offered; if a user has both Seller and Agent access, both appear alongside Shopper. No role is granted by choosing a UI tile; signed-in UID and server checks remain authoritative.
- A new store profile displays a large shop-photo hero plus a compact, premium **About this shop** card with trading hours, verified-status provenance, address, availability chips and contact/directions actions. Product prices/photos remain from *published Teyza inventory only*, never guessed from Google Places.
- Existing shopper and seller sessions, historic email credentials, cart state and Paystack memberships are not migrated.

## Google and Facebook device authentication
The signed build requires **real OAuth/Meta configuration**. Source code or debug login buttons alone do not prove that real sign-in is operational.

### Google
- Firebase project: `business-lift-3c19c`. Google provider must be enabled in **Firebase Authentication → Sign-in method**.
- Native Android package and original Play signing/upload certificate SHA-1/SHA-256 must appear in the exact Firebase Android app registration and Google OAuth client settings. Debug APKs use a *different* certificate, which must be registered separately if used for QA. The existing signed release gate validates the package, Firebase SDK JSON, Web OAuth client and upload SHA-1; do not bypass it.
- Provide the matching `TEYZA_GOOGLE_WEB_CLIENT_ID` Actions variable, `TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64` secret and original signing materials. For iOS use its own `TEYZA_GOOGLE_IOS_CLIENT_ID`, bundle ID and URL callback; not the Android client.
- On a **physical Android** phone, sign in with a first-time Google account and an existing seller Google account. Test sign-out, re-open and role selection. Repeat on iOS/TestFlight.

### Facebook
- Enable Facebook in Firebase Authentication; verify the app ID/secret there, and configure the exact Firebase OAuth redirect `https://business-lift-3c19c.firebaseapp.com/__/auth/handler` in Meta Facebook Login.
- Configure the Meta app for live public use with required App Review/permissions. Native builds use `TEYZA_FACEBOOK_APP_ID` (GitHub Actions variable) and **client token**, not app secret, in `TEYZA_FACEBOOK_CLIENT_TOKEN` (Actions secret). Signed packaging **fails closed** without both. The native Facebook SDK is intentionally omitted from unsigned builds without configuration.
- Check the Android package + registered Facebook key hashes for *every* used signing identity, and the iOS bundle ID / FB URL scheme. Test first-time Facebook registration, returning Facebook login and cancellation on real devices.
- If Google/Facebook says `OPERATION_NOT_ALLOWED`, validate the provider is enabled; for Android Google API error 10 validate the package/signing fingerprint. Never automatically merge two different Firebase UIDs with the same email.

## WhatsApp: from single-seller pilot to new-seller general availability
**Source changes are not live simply because they merged.** The default remains the isolated pilot. General delivery activates only when the project-specific Functions environment has:
```
TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1
TEYZA_WHATSAPP_ROLLOUT_MODE=all
TEYZA_WHATSAPP_ALL_STARTED_AT=<Unix milliseconds at first activation>
```
Do NOT rebase the activation timestamp during a redeploy. Older queued approvals remain untouched. Every proposed send checks the currently Admin-approved seller account, newest approved phone-verification submission, Firebase UID-matching phone credential and explicit WhatsApp consent tied to the same phone. The sender atomically claims the outbox record, Meta HTTP acceptance is recorded separately from signed webhook delivery receipts, and an uncertain request is never blindly retried. Signed inbound menus/STOP only route for uniquely matched approved consenting sellers. Sellers who did not opt in get no welcome.

### Operator procedure (Windows PowerShell)
1. In Meta WhatsApp Manager confirm the exact image-header, two-field `teyza_seller_welcome_menu` template has **Approved** status and the real public image URL is reachable. Confirm real pilot delivered/read receipt and working Start Selling/Advertise/Consultant buttons. Check outbound sender token/phone-number ID, webhook signature, and required Secret Manager secrets.
2. Merge this PR **only after CI is green**. Checkout the exact reviewed merge SHA on the release branch; avoid any unreviewed local changes.
3. Install the repo's pinned admin-release Firebase CLI if not present. Run **read-only** preflight:
```powershell
Set-Location "$HOME\Downloads\Business-lift"
.\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-General.ps1
```
4. When production template and seller consent checks are independently verified, explicitly activate scoped webhook + workers (no main mobile API or payment deployment):
```powershell
.\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-General.ps1 `
  -EnableForNewApprovals `
  -ConfirmMetaTemplateApproved `
  -ConfirmConsentPilotSuccessful
```
This preserves non-WhatsApp environment variables and retains the first activation timestamp in the local project-specific `.env`. Back up this environment state securely; future deployments should not silently restore an old pilot config. Review Cloud Functions logs and the private outbox/receipt statuses for a new, consenting approved seller before public launch.

### Acceptance evidence
- Two separate fresh sellers **after activation**: one opted in and approved; one opted out and approved. Only the opted-in seller receives the Meta-approved welcome once, after phone and Admin verification.
- Repeat the same event, force webhook redelivery, cancel approval, change consent/phone, use a duplicate phone and simulate an uncertain Meta response. No second message or unauthorized action.
- One seller without a valid template/Meta configuration remains configuration-required; nobody gets an invented message or an unverified 'delivered' status.
- Google, Facebook, anonymous browsing, legacy sign-in and owner/agent role selection tested on real devices. Never submit a live Play/TestFlight update on the basis of Flutter compilation alone.
