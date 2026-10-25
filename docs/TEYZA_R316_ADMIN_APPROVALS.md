# Teyza R3.16 — approve Flutter app sellers on the website

The app now saves verification photos successfully. The live R3.15 service
reports `verificationUploads: true`. The remaining admin blockers are separate:
`https://teyza.co.za/admin` returns 404 and the deployed R2.6 seller review page
uses an empty PHP API URL. PHP cannot run on Firebase Hosting, and that older
workflow does not review the Flutter app's seller records.

## Install the admin update

Extract **TEYZA_ADMIN_R316_ACTIVATION_KIT.zip**, open PowerShell in the extracted
folder, and run with Node.js 22 or newer and your authorised Firebase CLI account:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
firebase login
.\DEPLOY-ADMIN.ps1
```

Then open **https://teyza.co.za/admin**. The admin also works at `/admin/`,
`/admin.html`, `/admin-review.html`, `/admin-sellers.html`, `/admin-login.html`
and `/admin-dashboard.html`. All use the app's existing `teyzaMobile` service.
No replacement APK or mobile-service deployment is required.

The helper clones the current live Firebase Hosting version, adds only the
admin pages/assets and route rules, verifies that every unrelated file still
has its original content hash, and publishes the resulting version. It checks
that `teyza.co.za` belongs to the expected site and stops if another deployment
became live during preparation. It records the old version locally in
`hosting-backup-R316.json`. It preserves the live website, authentication,
seller records, private files, rules, Functions and existing encryption key.

**Do not run `firebase deploy --only hosting` using this kit's partial `public`
folder.** Use the supplied helper, which preserves the rest of the live site.
If needed, `./ROLLBACK-ADMIN.ps1` restores the preceding Hosting version only
while this admin release is still live.

## Give your chosen reviewer access

Existing reviewers with **`teyzaAdmin: true` and a verified email** can sign in.
An old PHP email allowlist or signing in as a seller does not grant this claim.
The project owner can assign access to the exact existing Firebase account:

1. Sign in on the admin page using your intended reviewer account. A verified
   Google account is supported, or use an existing verified email/password account.
2. Open https://console.firebase.google.com/project/business-lift-3c19c/authentication/users
   and copy that account's **User UID**. Check that it is the intended reviewer.
3. In the extracted kit run:

```powershell
.\GRANT-ADMIN.ps1 -Uid "YOUR_ADMIN_FIREBASE_UID"
```

4. Sign out of the admin page and sign in again.

The helper reuses your Firebase CLI account and requires project permissions
to read/update Firebase Authentication users. It changes only the chosen
account's `teyzaAdmin` custom claim and preserves all other claims. It rejects
disabled or email-unverified accounts; it never marks an email verified for you
or creates a password. Tokens and service-account keys are not printed, saved in
the kit or uploaded. Do not send private credentials in chat.
To remove reviewer access use the same command with `-Revoke`.

If Google reports `auth/unauthorized-domain`, add `teyza.co.za` in Firebase
Authentication > Settings > Authorised domains. Google login must already be
enabled in Sign-in method. Email/password login uses the same Firebase project.

## Review a seller

1. Sign in and choose a Spaza, retail or wholesale seller from the pending queue.
   Load more if there are over 30 submissions; search applies to loaded rows.
2. Open their current **ID / passport / company registration** and **owner selfie**.
   Inspect the photos and details, then tick the review confirmation.
3. Choose **Approve seller**, **Request new selfie**, or **Reject seller**.
   A request/rejection needs a clear note for the owner. Real phone verification,
   current evidence and reviewer authorisation are checked by the existing server.
4. A successful decision removes that submission from the pending queue and
   triggers the app's existing seller notification. Approval adds the verified
   identity badge. Registration completion still controls selling access; the
   review does not change paid catalogue entitlements or collect a payment.

Only owners who have submitted a selfie appear in this review queue. A saved
identity document alone does not yet make a complete review submission. Shop-front
photos remain optional listing photos in R3.15, and are not an extra prerequisite
for approval. The dashboard reviews the Flutter app records; old PHP-only web
applications stay in their existing system and are not silently migrated.

Private evidence appears in memory only and is cleared when the tab is hidden,
the selection/account changes, the reviewer signs out, or the five-minute review
session ends. Use **Renew session** to reauthenticate. The backend rejects
expired sessions, self-approval, unviewed/stale documents and replaced selfies.

## Validation and activation boundary

Automated tests exercise API requests, pagination, photo/review requirements,
stale replies/account changes, role denial, session expiry, review outcomes,
Hosting file/config preservation, concurrent deployments, rollback and
reviewer-claim preservation. Browser tests use synthetic accounts and evidence,
never real identity documents. Test the deployed page with an authorised reviewer
and one real seller before relying on live approvals. No seller decision is made
by the activation helper.

The kit is ready for publication from your authorised Firebase CLI environment.
It does not imply that Hosting has already been updated from ChatGPT.

Primary API references:
https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions/clone
https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions/populateFiles
https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/update
