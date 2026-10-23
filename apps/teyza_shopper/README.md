# Teyza Shopper 1.0.6 (16)

Premium local-shop discovery with photographic Everyday Essentials and Home, Shops, Cart, Orders and Account navigation.

Choose **Shopper** or **Shop Owner** to sign in with the existing Teyza Firebase account. Spaza and Other Retail / Wholesale owners use their saved shop category; shopper registration does not create a merchant account. New shop registration stays on the Teyza website. Owners can prepare private product drafts while approval and public activation remain server controlled.

Email/password works on Android and iOS. Google appears on Android only when native OAuth is configured for the build. iOS initially uses email/password; native social login is not enabled. Browsing and manual area selection do not require sign-in. GPS is optional and requested only when choosing the location feature.

Approved published merchants come from Firestore, while nearby Google Places data and photos use the isolated `teyzaPlaces` Firebase function. Public map listings do not imply verified affiliation, available stock or checkout. Private drafts remain separate from the public directory. Branded shop fallbacks are used when photos are unavailable; essentials photos are bundled offline.

See [release configuration and acceptance](../../docs/TEYZA_R38_MOBILE_RELEASE.md) for Android `.aab`, iOS archive/IPA, signing settings and device login verification. GitHub Actions **Teyza Android and iOS Release** builds both platforms. Automatic PR artifacts are explicitly unsigned; store signing uses existing credentials through a manual signed run. **Teyza Shopper APK** still produces Android test installs.
