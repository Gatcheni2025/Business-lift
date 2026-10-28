# Dedicated seller app view — 1.0.18 (28)

Signing in as a shop owner replaces the shopper root screen with a dedicated selling workspace. The seller does not see Home/Shops/Cart/Shopper Account navigation underneath a pushed profile page. The five seller destinations are Dashboard, Products, Orders, Chat and Business. The root seller screen has no back arrow into the shopper interface.

The dashboard leads with Add a product and selling tools, not a large business profile. Products retains the existing product picker, custom products, prices, stock, photos, editing and deletion. Orders uses the owner-scoped order endpoint. Customer chat requests an owner-scoped inbox and has seller-specific empty-state text. Business contains delivery/services, trading hours, verification and shop-front photo, membership mandate, notifications, supplier stock lists, profile editing and finance. Finance shows the server's review outcome; an enquiry or approval in principle does not create a loan or move money.

Areas around me provides opt-in GPS or manual base-area selection, approximate suburb-centre distances within 35 km and an external area map. It contains no business directory, shopper locations or invented demand figures. Reference suburbs are a limited planning aid; distances are not driving distances or delivery promises. Location is not saved to the seller's public listing by this screen.

The seller presentation preference is stored with the existing secure session, bound to the authenticated Firebase UID. A restored UID must match the saved preference. Older registered sellers without this preference are detected through their authenticated seller-account read. This is presentation state only: it cannot grant seller registration, approval, admin claims or API permissions. Users who choose seller login without a shop enter the existing registration flow. Email, Google, Apple and Facebook owner sign-in all use the same presentation switch.

Logout clears the secure mode preference, seller state and the shopper basket; the root returns to shopper browsing. A delayed seller-account lookup after logout or account change cannot restore seller mode. Public directory polling and shopper location prompts are suppressed while seller mode is active. If an older seller account cannot be checked during a network outage, owner login/Open shop owner workspace still enters a retryable seller view.

## Release

Deploy the current mobile service kit with `DEPLOY-MOBILE.ps1` first. The new `chat_list` owner scope is checked by the app; it refuses an older unscoped response rather than mixing customer conversations with purchases. No Firestore rules or hosting changes are included. The existing backend deployment also includes seller publication and completed-order ratings from the preceding marketplace update.

Build signed version 1.0.18 (28) from `feature/teyza-seller-workspace` using `teyza-mobile-release.yml` with `signed_release=true` and `platforms=all`. After the signed build succeeds, upload its iOS IPA with `upload_existing_ios_run=<signed run ID>` on this same branch. An unsigned PR build or saved GitHub IPA is not a TestFlight upload.

Validation covers secure mode restoration, UID mismatch, logout, delayed account reads, seller-only navigation, product list, owner orders/chat, finance entry, area planning and a narrow display with larger text. Phone previews are captured by CI. Real-device OAuth, notification delivery, photo capture and live order fulfilment still require installation and testing through the stores.
