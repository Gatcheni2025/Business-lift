# Teyza seller approval and product access rules

Sellers write product drafts directly to Firestore. Deploying the app and mobile function alone does **not** stop an older app or another client from writing drafts if the live Firestore rules still allow it. The current production rules have not been inspected by this kit.

1. In Firebase Console, open the **(default)** Firestore database for `business-lift-3c19c`. Copy the entire current published rules into `current-firestore.rules` in this folder. Keep a separate backup.
2. Run `.\DEPLOY-SELLER-ACCESS.ps1`. This only creates `firestore.seller-approval.candidate.rules`; it does not publish. It supports the known prior Teyza product block and refuses custom or potentially overlapping recursive write rules.
3. Compare the candidate with the current rules. In particular, check all overlapping wildcard/nested matches and ensure sellers cannot modify their own approval, billing, claim or WhatsApp records. Firestore grants access if *any* matching allow rule succeeds. Resolve any unknown rules manually rather than replacing the whole ruleset.
4. Test the candidate in a separate Firebase project or the Firestore Emulator: pending and rejected sellers cannot create or update a product; approved unpaid sellers cannot create or update one; current paid or valid administrator-complimentary sellers can; cross-account and anonymous writes fail; sellers can still delete their own private drafts. Check existing registration, seller profile and other project features too.
5. Only after reviewing and testing the exact current rules, publish the candidate from the Firebase Console, or run `.\DEPLOY-SELLER-ACCESS.ps1 -PublishReviewed`. The script cannot independently verify that production rules have not changed since the copy was taken. If they changed, start again from the latest published version.

Do not use the repository's `firestore.rules` as a replacement for the live project. These changes are scoped to seller rules. Read-only owner access stays available while approval is pending; new product writes require approval plus a verified live subscription or a current, recorded administrator exception. An owner may delete an existing private draft when access is paused.

See `docs/TEYZA_SELLER_CLAIMS_AND_APPROVAL_WHATSAPP.md` in the source for the complete backend, website, store billing and WhatsApp setup. Never put private credentials in rules or share them in chat.
