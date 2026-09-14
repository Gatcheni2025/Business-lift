# Business Expo selling connections

Business Expo connects seller-owned commerce accounts through same-origin PHP endpoints. Firebase Cloud Functions and Firestore are not used for connection storage.

## Seller-facing flow

1. Open `sales-channels.html`.
2. Connect Meta, Google or WhatsApp Business.
3. If the seller manages multiple Facebook Pages or Google Merchant accounts, choose the account Business Expo should use.
4. The page shows **Connected** only after PHP has stored a usable server-side connection.
5. Return to `seller-onboarding.html` to continue delivery, payment and audience setup.

Facebook and Instagram intentionally share one Meta connection. Instagram is discovered from the professional Instagram account linked to the selected Facebook Page.

## PHP endpoints

```text
/api/social-connections.php
/api/social-callback.php
```

`social-connections.php` handles connection state and creates OAuth URLs. `social-callback.php` exchanges authorization codes on the server and stores provider credentials in protected PHP storage.

## Required server variables

```text
APP_URL=https://www.businessexpo.co.za
OAUTH_STATE_SECRET=<long-random-secret>
META_APP_ID=<meta-app-id>
META_APP_SECRET=<meta-app-secret>
META_GRAPH_VERSION=v23.0
META_WHATSAPP_CONFIG_ID=<whatsapp-config-id>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
```

Do not put these secrets in frontend JavaScript or GitHub.

## OAuth callbacks

Register these exact callback URLs:

```text
https://www.businessexpo.co.za/api/social-callback.php?provider=meta
https://www.businessexpo.co.za/api/social-callback.php?provider=google
```

The callback only returns to approved Business Expo pages and rejects arbitrary return paths.

## What the PHP backend verifies

- **Meta:** OAuth succeeds and an accessible Facebook Page is found/selected. If multiple Pages exist, the seller chooses one before the status becomes Connected.
- **Google:** OAuth succeeds and an accessible Merchant Center account is found. If multiple accounts exist, the seller chooses one.
- **WhatsApp:** Embedded Signup provides the WABA ID and phone-number ID; PHP exchanges the authorization code and stores the resulting server credential.

## CORS

The browser calls only same-origin endpoints under `https://www.businessexpo.co.za/api/`. It does not call `us-central1-business-lift-3c19c.cloudfunctions.net`, so the previous Firebase Functions preflight/CORS error is removed from this flow.

## Credential security

Connection credentials are stored in `storage/`, which is denied to public HTTP access by `storage/.htaccess`. Provider access tokens are never returned by the public API response; the browser receives only safe connection information such as provider, status, display name, selected Page/account and account-selection choices.

## Deployment sequence

1. Configure Meta, Google and WhatsApp Embedded Signup.
2. Set the PHP server variables listed above.
3. Add the callback URLs to Meta and Google.
4. Confirm PHP can write to `storage/`.
5. Deploy the HTML/JS/PHP files to `www.businessexpo.co.za`.
6. Sign in with a real seller account and test Meta, Google and WhatsApp.
7. Confirm browser network requests stay on `www.businessexpo.co.za` except for the expected provider OAuth/SDK redirects.

Meta production permissions can require App Review and Business Verification.
