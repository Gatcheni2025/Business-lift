# Teyza seller dashboard access repair

The screenshot's 403 is from a Firestore read of either the seller's own account or private draft products. It is separate from the R3.9 mobile Cloud Function. Installing an APK or deploying that function alone cannot publish Firestore access rules. The live rule text has not been inspected from this session, so the blocked path is not yet proven.

## Apply from Windows

1. Open https://console.firebase.google.com/project/business-lift-3c19c/firestore/rules . Check the project is **business-lift-3c19c**, and select the **(default)** database.
2. Copy the entire CURRENT published rules editor into Notepad. Save it in this extracted folder as `current-firestore.rules`, using **Save as type: All files** and UTF-8. Keep the original rules; do not use the repository's old `firestore.rules` or test-mode rules.
3. In PowerShell in this folder, run:

   ```powershell
   .\DEPLOY-SELLER-ACCESS.ps1
   ```

The helper needs Node.js and a Firebase CLI login authorised for this project. It backs up the supplied file and generates `firestore.seller-access.fixed.rules`. Existing seller matches receive only owner-read clauses; their write/admin rules remain intact. Missing seller matches receive the original strict R2/R2.7 account/draft rules. All other source text is retained. Only Firestore rules are deployed; no Hosting, Functions, Storage rules or data are changed.

To prepare and inspect without deploying, run `node .\repair-seller-rules.mjs` and open `firestore.seller-access.fixed.rules`. You may paste that generated full file into the same Firebase Rules editor and Publish instead of using the deployment script. If the helper reports duplicate/nested rules, do not guess or replace the full ruleset: have the current rules reviewed.

4. Reopen Teyza with the same account used for shop registration, then tap **Retry**. A pending shop must be able to access its dashboard before approval. Confirm both Spaza and Other Retail owners can open their own saved shop and manage private product drafts.

## What remains protected

Anonymous users and other Firebase UIDs receive no new access. Owners cannot list everyone's seller accounts. No new client permission is granted for approval, activation, payment, verification outcomes or public catalogue changes. Existing seller write permissions stay unchanged; a missing account rule creates only pending/not-listed records, and missing product rules permit private drafts only.

The v1.0.8 (18) app identifies `SELLER_PROFILE_ACCESS` versus `SELLER_PRODUCTS_ACCESS`, offers account switching, and keeps a successfully loaded owner dashboard available when product loading alone fails. It never treats a denied read as an empty or unregistered shop. If denial remains after publishing, capture the support reference and check the signed-in Firebase UID against the seller document ID, the app's Firebase project and App Check enforcement. Do not share passwords, ID tokens or service-account keys.

After deployment, use Rules Playground with an owner UID to test Get on `/teyzaSellerAccounts/OWNER_UID` and List on `/teyzaDraftProducts/OWNER_UID/items`. Repeat with a different UID and anonymous access: both must be denied. Test owner draft create/edit/delete and confirm approval/listing fields cannot be changed. Automated emulator tests validate the bundled rules; they do not certify a live deployment or every custom rule in the supplied source.
