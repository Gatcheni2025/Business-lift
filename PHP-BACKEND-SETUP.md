# Business Expo PHP backend setup

Business Expo now uses the PHP backend for workspace data. Firestore and Firebase Cloud Functions are no longer part of the application data path.

Firebase Authentication is retained only for sign-in and password reset. Each request to a private PHP endpoint includes the signed-in user's Firebase ID token; PHP validates that token before reading or writing workspace data.

## PHP-backed modules

The PHP backend now handles:

- business registration profile and business profile updates
- products and inventory
- compressed product image uploads
- orders and order status/payment status data
- customer activity derived from orders
- dashboard totals, recent orders, stock alerts and seller balances
- delivery settings
- shop settings
- banking / PayFast / other payment preferences
- seller audience settings
- partner network profile
- seller onboarding state
- Facebook/Instagram, Google Merchant and WhatsApp connection state
- OAuth callbacks for selling-channel connections
- dashboard sales-support chat requests

The old `functions/`, `firebase.json` and `firestore.rules` files were removed so the repository no longer deploys Firestore or Firebase Functions by accident.

## Server requirements

Use PHP 8.1+ with these extensions enabled:

- curl
- openssl
- gd (recommended for server-side image compression)
- json

The web server must allow PHP to write to:

- `storage/`
- `uploads/products/`

The application creates runtime folders automatically. Runtime JSON data and uploaded product images are excluded from Git.

## Required server variables

Set these in the hosting control panel / Apache environment. Do not put secrets into GitHub.

```text
FIREBASE_PROJECT_ID=business-lift-3c19c
APP_URL=https://www.businessexpo.co.za
OAUTH_STATE_SECRET=<long-random-secret>
BUSINESS_EXPO_DATA_KEY=<64-character-random-hex-value>
META_APP_ID=<meta-app-id>
META_APP_SECRET=<meta-app-secret>
META_GRAPH_VERSION=v23.0
META_WHATSAPP_CONFIG_ID=<whatsapp-embedded-signup-config-id>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
BUSINESS_EXPO_SALES_EMAIL=<email that receives sales-chat alerts>
```

Generate the two private keys separately:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one output as `OAUTH_STATE_SECRET` and the other as `BUSINESS_EXPO_DATA_KEY`. The data key encrypts bank account numbers, PayFast Merchant Keys and PayFast passphrases with AES-256-GCM before they are written to disk.

## Main API endpoints

```text
/api/profile.php             Business profile
/api/products.php            Products, stock and product image upload
/api/orders.php              Orders
/api/customers.php           Customer activity
/api/dashboard.php           Dashboard summary
/api/settings.php            Delivery, shop, payments, audience and partner settings
/api/social-connections.php  Selling-channel connections
/api/social-callback.php     OAuth callback
/api/sales-chat.php          Dashboard sales-support messages
```

All private endpoints require a valid Firebase Authentication ID token in the `Authorization: Bearer ...` header. Firebase is therefore identity-only; business data is not stored in Firestore.

## OAuth callback URLs

Register these exact callback URLs in Meta and Google:

```text
https://www.businessexpo.co.za/api/social-callback.php?provider=meta
https://www.businessexpo.co.za/api/social-callback.php?provider=google
```

For WhatsApp Embedded Signup, configure `https://www.businessexpo.co.za` in the Meta app and set `META_WHATSAPP_CONFIG_ID` on the server.

## Product uploads and compression

The browser compresses JPG/PNG/WebP product images before upload. PHP performs a second resize/compression pass when GD is available and stores the final files under:

```text
/uploads/products/
```

Up to 5 product images are accepted per product. `upload_product.php` remains as a compatibility entry point and forwards to `api/products.php`.

## Data storage

Current PHP persistence is file-backed JSON under the protected `storage/` directory, keyed by the authenticated user's workspace ID. The folders include profiles, products, orders, settings, integration state and sales-chat messages.

Sensitive payment values are encrypted before storage. Public settings responses never return the full bank account number, PayFast Merchant Key or PayFast passphrase.

`storage/.htaccess` blocks direct public access. `uploads/.htaccess` blocks PHP/script execution inside uploads. The root `.htaccess` preserves the `Authorization` header for PHP/FastCGI hosting.

For higher traffic, the same API contracts can later be moved from JSON files to MySQL without changing the browser pages.

## CORS

Browser requests no longer call `us-central1-business-lift-3c19c.cloudfunctions.net`. Business Expo uses same-origin endpoints under `https://www.businessexpo.co.za/api/`, removing the Firebase Functions preflight/CORS failure from the workspace.

## Deployment test

After uploading the branch to the PHP host, test in this order:

1. Register a new account and sign in.
2. Save `business-profile.html`, reload it and verify the details remain.
3. Add a product with several images and verify the files are compressed and displayed after reload.
4. Create an order and verify product stock decreases.
5. Reload `orders.html` and `customers.html` and verify the order/customer totals remain.
6. Open `dashboard.html` and verify revenue, orders, customers, product count and recent orders.
7. Send a dashboard sales-support chat message.
8. Save delivery settings, shop settings, payment settings, audience settings and the partner network profile; reload each page and verify persistence.
9. Connect Meta/Google/WhatsApp from `sales-channels.html` and confirm callbacks return to `www.businessexpo.co.za`.
10. Open the browser console and confirm there are no requests to Firestore or `cloudfunctions.net`.

## Important production note

The current storage layer is suitable for the present PHP migration/MVP. Before large-scale production traffic, migrate `storage/*.json` persistence to MySQL with transactions. The frontend does not need to change when that storage implementation changes because it already talks only to the PHP API.
