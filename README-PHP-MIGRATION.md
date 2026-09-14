# Business Expo PHP migration status

Business Expo workspace persistence has moved off Firestore and Firebase Cloud Functions.

## Runtime architecture

- Firebase Authentication: sign-in identity only
- PHP API: all Business Expo workspace data and server actions
- Protected server storage: profiles, products, orders, settings, integrations and support-chat messages
- Product files: PHP uploads with browser + server compression

## Migrated application areas

- registration business profile
- business profile
- products and inventory
- product image upload/compression
- orders
- customers
- dashboard metrics and recent orders
- delivery settings
- shop settings
- EFT / PayFast / other payment preferences
- seller target audience
- partner network
- seller onboarding
- Meta / Instagram connections
- Google Merchant connection
- WhatsApp Business connection
- dashboard sales-person chat notification

## Removed legacy backend

The Firebase Functions source folder, Firestore rules/deployment configuration and obsolete Firebase publishing prototype were removed from the PHP migration branch. Browser modules no longer initialize Firestore.

See `PHP-BACKEND-SETUP.md` for server variables and deployment checks.
