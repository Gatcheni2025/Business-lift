# Business Expo social integrations

Business Expo includes Firebase Cloud Functions for merchant-owned social and commerce channel connections.

## Included

- Meta OAuth for Facebook Pages and Instagram professional accounts
- Google OAuth for Merchant API access
- WhatsApp Business Embedded Signup completion endpoint
- Secure OAuth state signing
- Admin-only token storage under `integrations/{businessId}/channels/{provider}`
- Connection status and disconnect callables
- Dashboard client module: `js/social-connections.js`

## Required Firebase secrets

```bash
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set OAUTH_STATE_SECRET
```

Set `APP_URL` and `FUNCTIONS_BASE_URL` for the deployed environment. Register the generated `socialOAuthCallback` URL in both Meta and Google developer consoles.

## Firestore security

Provider credentials must never be client-readable. Add a deny rule for the integration token path:

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

1. Configure Meta and Google apps.
2. Set the Firebase secrets above.
3. Add the OAuth callback URL to Meta and Google.
4. Merge the Firestore deny rule into your existing rules.
5. Deploy functions with `firebase deploy --only functions`.
6. Deploy hosting after the dashboard changes are merged.

Meta permissions can require App Review / Business Verification before production users can grant advanced permissions.
