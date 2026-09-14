# Business Expo PHP backend setup

This branch moves the immediate Business Expo workspace errors away from Firestore/Cloud Functions for:

- business profile loading/saving
- product loading/saving
- product image uploads
- client-side + server-side image compression
- Facebook/Instagram, Google Merchant and WhatsApp connection entry points
- dashboard sales-chat requests
- dashboard product totals

Firebase Authentication is still used for sign-in. PHP verifies the Firebase ID token before allowing access to private API data.

## Server requirements

Use PHP 8.1+ with these extensions enabled:

- curl
- openssl
- gd (recommended; used for server-side image compression)
- json

The web server must allow PHP to write to:

- `storage/`
- `uploads/products/`

The application creates those runtime folders automatically. Runtime data and uploaded product images are excluded from Git.

## Required server variables

Set these in your hosting control panel / Apache environment. Do not put secrets into GitHub.

```text
FIREBASE_PROJECT_ID=business-lift-3c19c
APP_URL=https://www.businessexpo.co.za
OAUTH_STATE_SECRET=<long-random-secret>
META_APP_ID=<meta-app-id>
META_APP_SECRET=<meta-app-secret>
META_GRAPH_VERSION=v23.0
META_WHATSAPP_CONFIG_ID=<whatsapp-embedded-signup-config-id>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
BUSINESS_EXPO_SALES_EMAIL=<email that should receive dashboard sales-chat alerts>
```

Generate `OAUTH_STATE_SECRET` as a long random value (32+ bytes).

## OAuth callback URLs

Register these exact callback URLs in Meta and Google:

```text
https://www.businessexpo.co.za/api/social-callback.php?provider=meta
https://www.businessexpo.co.za/api/social-callback.php?provider=google
```

For Meta WhatsApp Embedded Signup, configure the same production domain in the Meta app settings and set `META_WHATSAPP_CONFIG_ID` on the server.

## Product uploads

The product page now sends images to:

```text
/api/products.php
```

The browser compresses selected images to WebP before the request. The PHP backend then performs a second resize/compression pass (when GD is installed) and saves files under:

```text
/uploads/products/
```

Up to 5 images are accepted per product. JPG, PNG and WebP are allowed.

`upload_product.php` remains as a compatibility entry point and forwards to `api/products.php`.

## CORS

The old browser requests to `us-central1-business-lift-3c19c.cloudfunctions.net` have been removed from `js/social-connections.js`. Social connection requests now use the same `www.businessexpo.co.za` origin through PHP, so the reported Firebase Cloud Functions preflight/CORS error is no longer part of this flow.

## Storage security

`storage/.htaccess` blocks public access to stored profile/product/integration/chat JSON data.

`uploads/.htaccess` blocks PHP/script execution in the upload directory.

The root `.htaccess` also preserves the `Authorization` header so PHP can verify Firebase ID tokens on Apache/FastCGI hosting.

## Deployment check

After deploying, test in this order:

1. Sign in to Business Expo.
2. Open `business-profile.html` and save the profile.
3. Open `products.html`, select a product image and add a product.
4. Reload `products.html` and verify the product remains visible.
5. Open `dashboard.html` and verify the product count and sales-chat notification.
6. Open `sales-channels.html` and test Meta/Google connection buttons.
7. Confirm OAuth redirects return to `www.businessexpo.co.za` rather than Firebase Functions.

## Important

Other workspace modules that still have legacy Firestore code (for example orders, customers, delivery/shop settings and network data) should be migrated to PHP as the next backend phase. This branch intentionally fixes the current product/profile/guard/social/dashboard errors first rather than silently mixing two persistence models in those modules.
