# Teyza R319 — Secure Firebase administrator operations

**Development branch:** `fix/teyza-firebase-admin-users-documents-20261103`  
**Firebase service required:** `3.18.0`, with `adminUsers=true` and `adminSellerDocuments=true`  
**Admin portal:** https://teyza.co.za/admin

This release extends the existing Teyza admin dashboard, preserving the production website, customer app, Firestore rules, Functions outside the `teyza-mobile` codebase, and private evidence storage. **It is not deployed just by merging a PR.**

## Admin functions

- **Approvals & images:** the existing secure pending queue remains the only place that approves/rejects seller submissions or asks for a replacement selfie. The reviewer must have a verified email, `teyzaAdmin` claim and a fresh sign-in (five-minute review session). Real phone verification, current encrypted ID/passport/company evidence, current owner selfie, views of each photo and a confirmed review are required. Reviewers cannot approve their own shops.
- **Seller directory:** view all seller records (paginated), listing/approval status, accounts and R99 membership. Open a seller to see current identity-document and selfie metadata and view each available document privately, regardless of whether it still appears in the pending queue. These documents are decrypted on demand by the existing authenticated service and are not public URLs. Expired/replaced evidence is not accessible. The photo is removed when closed, on view change or when the five-minute session expires. Admin cannot upload a different seller's identity and silently approve the account.
- **Users & access:** list Firebase users (30 at a time), view email verification and disabled status, and inspect account role (shopper/seller/administrator). Create **shopper or seller login accounts only** when the person has requested access, or send a password-setup email to an existing account. New sellers must complete genuine registration, phone verification, ID/selfie and approval; they cannot sell simply because an administrator created their login.
- **Account access:** authorized administrators may suspend/reactivate *nonadministrator* accounts. Sessions are revoked when suspended. An administrator cannot suspend their own account, another administrator, grant `teyzaAdmin`, set someone else's password, mark an email verified or override a seller's actual review.

All actions require the `teyzaAdmin:true` custom claim, verified email and fresh authentication. Mutations are logged with the administrator UID, target and timestamp; passwords and original documents are never logged.

## New user invitation behavior

1. Select **Users & access** → **Add a user**.
2. Enter the person's full name and email; choose **Shopper** or **Seller**.
3. Confirm they requested the account.
4. The backend creates a Firebase Auth record with a random non-disclosed password, **email not verified**, and sends a Firebase password-reset link as the initial password-setup invitation.
5. The user opens their email, chooses their own password, signs in to Teyza, verifies the email and (for sellers) completes onboarding and submits their documents.
6. If Firebase cannot send the email, the admin UI shows a warning and the administrator can **Send password setup email** again. Do not create the same account a second time.

Configure Firebase Authentication **Email/Password** provider, authorized domain and Email Templates before real invitations. An account-created response does not prove the recipient read the invitation. Existing Google/Apple users can sign in with their provider; avoid sending account setup links to unrelated identities.

## Production activation (from the reviewed R319 activation kit)

Download `teyza-admin-r319-users-kit` from a successful **Teyza operations admin R319** GitHub Actions workflow. Extract the `TEYZA_ADMIN_R319_OPERATIONS_KIT.zip` file to a new folder. Using PowerShell in that folder with Node.js 22 and an authorized Firebase CLI session:

```powershell
firebase login
.\DEPLOY-OPERATIONS.ps1
```

This tests the Firebase service and deploys **only `functions:teyza-mobile:teyzaMobile`**, verifies `3.18.0`, then uses the existing scoped Firebase Hosting clone/patch operation to upload only the admin HTML/CSS/JS. Do **not** publish the kit's partial `public/` folder with a plain `firebase deploy --only hosting`: that could replace other website pages. The helper preserves unrelated Hosting file hashes and refuses to deploy over a newer live website release.

If the admin has never been granted access, the project owner should use the existing `GRANT-ADMIN.ps1 -Uid "FIREBASE_UID"` helper, after verifying that Firebase user already has an email-verified account. Merely typing an administrator's email in the portal does not grant any administrative claim.

### Verification checklist

- Sign in as a genuine `teyzaAdmin` reviewer and open a pending seller; inspect current ID and selfie, approve/reject/request new photo and confirm the seller receives the decision.
- Open an already approved seller in **Sellers** and view available current verification documents. Check that expired documents show **Unavailable** and private images are cleared after dialog closure or sign-out.
- Open **Users & access**, page/search users, invite one authorized disposable test shopper, confirm the email/password setup link is received and account remains email-unverified until completed. Repeat for a seller and confirm no seller approval was granted.
- Suspend and reactivate the disposable user. Verify a disabled user cannot sign in. Confirm admins cannot suspend themselves or each other.
- Sign in as a normal shopper and as an unverified account; both must be rejected from every admin endpoint, even if they manually call the API.
- Verify the other website pages, TestFlight builds and production customer flows remain unchanged. Do not store real identity documents or password reset links in bug reports.

**Limitations:** The admin user form does not create Super Admin accounts. Billing remains `manual_receipt`; this release neither charges R99 nor changes StoreKit subscriptions. Live Firebase user creation/email delivery and seller evidence must be tested with the proper production credentials before considering the portal complete.
