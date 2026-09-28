# Teyza selling connections

Teyza uses Firebase Cloud Functions to connect seller-owned commerce accounts and only shows **Connected** after the backend has a usable account.

## Seller-facing flow

1. Open `sales-channels.html`.
2. Connect Facebook, Instagram, WhatsApp Business or Google Shopping.
3. Facebook and Instagram share one Meta authorization. Choose the Facebook Page Teyza should use. Instagram becomes available only when that selected Page has a professional Instagram account linked to it.
4. WhatsApp Business uses Meta Embedded Signup and stores the connected WABA/phone-number ID server-side.
5. Google Shopping uses the seller's Google Merchant Center account.
6. The Add Product screen only shows external channels that are genuinely connected.

## Required Firebase secrets

Set these before deploying the social connection functions:

```powershell
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set META_WHATSAPP_CONFIG_ID
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set OAUTH_STATE_SECRET
```

`META_WHATSAPP_CONFIG_ID` is the Configuration ID created in **Meta → Facebook Login for Business → Configurations → WhatsApp Embedded Signup**.

## Functions parameters

The code also uses:

- `APP_URL` — production default is `https://teyza.co.za`.
- `FUNCTIONS_BASE_URL` — production default is the us-central1 URL for `business-lift-3c19c`.
- `META_GRAPH_VERSION` — defaults to `v23.0`.

## OAuth / Embedded Signup URLs

Configure these in the provider consoles:

**Meta Facebook + Instagram OAuth redirect**
```text
https://us-central1-business-lift-3c19c.cloudfunctions.net/socialOAuthCallback?provider=meta
```

**Google Merchant Center OAuth redirect**
```text
https://us-central1-business-lift-3c19c.cloudfunctions.net/googleOAuthCallback
```

For WhatsApp Embedded Signup, use the same Meta app and the `META_WHATSAPP_CONFIG_ID` created for the app.

## What the backend verifies

- **Facebook:** Meta OAuth succeeds and an accessible Facebook Page is selected.
- **Instagram:** the selected Facebook Page must expose an `instagram_business_account`; otherwise Instagram remains unavailable on Add Product.
- **Google Shopping:** OAuth succeeds and a Merchant Center account is selected.
- **WhatsApp Business:** Embedded Signup returns a WABA ID and phone-number ID; the backend exchanges the code, fetches the business phone record and stores the connection.

## Firestore security

Provider credentials must never be client-readable:

```text
match /integrations/{businessId} {
  allow read, write: if false;
  match /channels/{provider} {
    allow read, write: if false;
  }
}
```

Cloud Functions use the Admin SDK and are not blocked by these client rules.

## Deployment sequence

1. Configure the Meta app products for Facebook Login for Business, Instagram API and WhatsApp Embedded Signup.
2. Set the six Firebase secrets above.
3. Add the Meta and Google redirect URLs.
4. Confirm the Firestore deny rule for `/integrations/**`.
5. From the `functions` project directory dependencies, deploy:
   `firebase deploy --project business-lift-3c19c --only functions`
6. Upload the updated website/PHP files to `teyza.co.za`.
7. Test a seller account on `sales-channels.html` and confirm Facebook, Instagram, WhatsApp and Google statuses independently.

Meta production permissions can require App Review and Business Verification before real seller accounts outside app roles can connect.
