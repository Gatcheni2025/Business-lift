# Business Expo selling connections

Business Expo uses Firebase Cloud Functions to connect seller-owned commerce accounts and only shows **Connected** after the backend has a usable account.

## Seller-facing flow

1. Open `sales-channels.html`.
2. Connect Meta, Google or WhatsApp Business.
3. If the seller manages more than one Facebook Page or Google Merchant account, choose the account Business Expo should use.
4. The page shows a green **Connected** confirmation only after the account is selected and stored server-side.
5. Return to `seller-onboarding.html` to continue delivery, payment and audience setup.

Facebook and Instagram intentionally use **one Meta connection**. Instagram is discovered from the professional Instagram account linked to the selected Facebook Page.

## Required Firebase secrets

```bash
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set OAUTH_STATE_SECRET
```

## Required Functions configuration

Set these values for the deployed environment:

- `APP_URL`
- `FUNCTIONS_BASE_URL`
- `META_GRAPH_VERSION`
- `META_WHATSAPP_CONFIG_ID`

`META_WHATSAPP_CONFIG_ID` is the Configuration ID created in **Meta → Facebook Login for Business → Configurations → WhatsApp Embedded Signup**. The seller-facing WhatsApp Connect button will explain that setup is unavailable until this value is configured.

## OAuth callback

Register this callback in Meta and Google using the actual deployed Functions region/domain:

```text
https://us-central1-business-lift-3c19c.cloudfunctions.net/socialOAuthCallback
```

The callback safely returns the seller to either Selling Connections or Seller Setup and does not allow arbitrary redirect paths.

## What the backend verifies

- **Meta:** OAuth succeeds and an accessible Facebook Page is selected. If multiple Pages exist, the seller must choose one before the status becomes Connected.
- **Google:** OAuth succeeds and an accessible Merchant Center account is found. If multiple accounts exist, the seller must choose one.
- **WhatsApp:** Embedded Signup returns a WABA ID and phone-number ID, the backend exchanges the code, fetches the phone record, stores the connection and attempts to subscribe the app to the WABA.

Google account discovery uses the Merchant API `accounts.list` endpoint with the `https://www.googleapis.com/auth/content` OAuth scope.

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

1. Configure Meta, Google and WhatsApp Embedded Signup.
2. Set the Firebase secrets above.
3. Set `META_WHATSAPP_CONFIG_ID`, `APP_URL` and `FUNCTIONS_BASE_URL`.
4. Add the OAuth callback URL to Meta and Google.
5. Confirm the Firestore deny rule for `/integrations/**`.
6. Deploy Functions: `firebase deploy --only functions`.
7. Deploy Hosting.
8. Test with one real seller account and confirm each green Connected state.

Meta production permissions can require App Review and Business Verification.