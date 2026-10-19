# Teyza Shopper APK

**Shoppers, not shop owners.** This Android app does not contain merchant registration, banking or funding.

## Features
- Browse participating approved spaza shops without an account
- Search shop name, neighbourhood and product
- Select a shop and see its live published products, prices and stock quantities
- Real public product photos from teyza.co.za with safe placeholders
- Basket for one shop at a time; adjust quantities up to reported stock
- Optional WhatsApp order enquiry ONLY if the merchant explicitly opts in
- No in-app card payments. WhatsApp contact is an enquiry, not a confirmed order

## Live data integration
Endpoint: `https://teyza.co.za/api/shopper-catalog.php`.
Deploy `api/shopper-catalog.php` and `api/shopper-settings.php` to the hosting document root.
Only shops with **admin-approved** company status AND **shopperEnabled=true** appear.
Only positive-stock products explicitly marked published and visible appear.
This intentionally shows an accurate "No shops listed yet" message until shops actually opt in; no fabricated sample shops.

### Merchant publishing
The public PHP catalogue exposes no funding documents, owner accounts, ID uploads, bank records or unpublished products. Merchant settings use Firebase ID-token verification and allow approved shop owners to opt into public listing. Direct WhatsApp order enquiries are disabled unless opted in.

## Build / test
From this app directory:

```bash
flutter create --platforms android --org za.co.teyza --project-name teyza_shopper .
flutter pub get
flutter test
flutter build apk --debug
```

GitHub Actions `Teyza Shopper APK` performs these steps and uploads `teyza-shopper-spaza-debug-apk`.
The debug APK is for testing only, not Play Store release signed.
Production requires end-to-end storefront and connectivity testing, abuse safeguards for enquiries, release signing and store disclosures.

## Privacy
No buyer location request or private seller data in the mobile APK. Search by published area text. Shopper app does not retrieve the six-month banking/funding records.
