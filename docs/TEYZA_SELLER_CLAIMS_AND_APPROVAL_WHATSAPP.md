# Seller approval, Google business claims and WhatsApp

## Expected journey

Registration is free. A seller can choose “Own this shop? Claim it on Teyza” from an unclaimed Google listing or search for their business during registration, confirm the proposed name and address, and request that the listing be linked to Teyza. If signed out, they first sign in or register as a shop owner. If Google cannot provide a full street address, the seller chooses it separately. The owner must still submit the ID or company document, selfie and verified mobile number. A Google listing or Google account does not prove ownership or grant Teyza approval.

An authorised reviewer must inspect current identity evidence and, for a claim, review the Google listing and confirm the applicant's authority. A transaction prevents two owners from being approved against the same Google place ID. An approved claimed place is matched to the verified Teyza shop in nearby results. If a business is already linked to somebody else, contact support for manual review. Existing Teyza seller accounts are not silently re-registered or automatically linked by this flow.

After approval, the seller chooses **Add a product**, reviews the available payment option and, if they choose it, completes checkout. The introductory eligible month is R49 and renewal is R99/month. An administrator may grant the existing time-limited complimentary exception. No charge is initiated at registration or simply by opening a page. Products require both approval and active product access. Historical private drafts remain recoverable; removal remains possible.

## Before testing or release

- The app, this mobile service, the seller review website, the getting-started page and the scoped Firestore rules must be released together. Do not publish the bundled old full-project rules. Prepare and test a candidate using `tools/seller-access/README-START-HERE.md`, starting from the **current** live rules. Check all overlapping rules and verify an owner cannot self-approve or write billing/claim records.
- The last known Paystack key was a test key. This service refuses test-mode membership checkout in the production project and does not treat a test payment as product entitlement, including in a separate test project. Use an isolated Firebase project and test Paystack plan to verify the transaction, webhook and renewal records. A time-limited administrator exception can test the product screens separately; it does not prove payment activated access. End-to-end test-payment activation remains a separate task. Do not switch to live until verified and authorised.
- The existing store builds set `TEYZA_PAYMENT_CHANNEL=store`. Store billing is not implemented here; on those builds the app displays that store billing is coming soon rather than opening Paystack. A signed build does not establish that checkout works. Review store policy and finish an approved payment integration for the relevant platform before launch.
- The mobile service uses the configured Google Places key and its existing address-signing secret. The key needs Places Autocomplete (New) and Place Details (New). Search results include Google Maps attribution. Only the verified reviewer links a Google place; the place ID can be retained, while other Google-derived data is subject to Google Maps Platform policies and the existing address/location retention rules.
- Publish `seller-getting-started.html` using the existing **scoped Hosting overlay**. The file is included in `tools/app-first-release/paths.json`. Do not deploy a partial public folder as a full Hosting replacement. Verify `https://teyza.co.za/seller-getting-started.html` works before enabling WhatsApp sends.

## WhatsApp configuration

This implementation uses the official WhatsApp Cloud API. It does not use the WhatsApp consumer app or scrape WhatsApp. A recipient must explicitly opt in; registration offers an optional checkbox and the verification page can change the preference. Existing sellers who did not opt in will not receive an automatic message. Teyza's regular in-app approval notifications remain separate.

1. In Meta, create/connect the Teyza WhatsApp Business account and business phone number. Configure a Cloud API sender and submit an **approved utility message template** with no variables or buttons. A suggested exact body is:

   > Your Teyza seller account has been approved. Get started: https://teyza.co.za/seller-getting-started.html. Need help? Contact support@teyza.co.za.

   The template's actual approved name, language and content must match the settings. The URL must be live before activation. Template approval and message delivery are controlled by Meta.
2. Set the non-secret function environment values in the appropriate Firebase Functions `.env.<project-id>` file: `TEYZA_WHATSAPP_PHONE_NUMBER_ID`, `TEYZA_WHATSAPP_API_VERSION` (for example, a currently supported `vNN.0`), `TEYZA_WHATSAPP_TEMPLATE_NAME` and `TEYZA_WHATSAPP_TEMPLATE_LANGUAGE` (for example, `en`). Do not use the WhatsApp business account ID in place of the phone number ID.
3. Store the Cloud API token as Firebase Secret Manager secret `TEYZA_WHATSAPP_ACCESS_TOKEN` using `firebase functions:secrets:set TEYZA_WHATSAPP_ACCESS_TOKEN --project <project-id>`. Enter it only in the protected CLI prompt; do not paste the value in chat, source control or the public `.env` file. The two new WhatsApp functions bind this secret; it must exist before deploying them. The deployed runtime identity needs access to it.
   The scoped `DEPLOY-OPERATIONS.ps1` does **not** deploy the workers. After setup, deploy `functions:teyza-mobile:teyzaWhatsAppApprovalCreated,functions:teyza-mobile:teyzaWhatsAppApprovalPending` using `firebase.teyza-mobile-v39.json` in the chosen project, or use the complete mobile codebase deployment when its prerequisites are met. Check the actual functions and their service-account access after deployment.
4. Test in an isolated project with a number that explicitly opted in, an approved test template and a test sender. Approve one seller and check the private `teyzaWhatsAppApprovalOutbox` entry. `queued` / `configuration_required` means not yet sent; `accepted` means Meta accepted the API request, **not** that the handset received it. There is currently no delivery-status webhook. `skipped` means consent, approval or phone checks failed. `needs_review` or a stuck `sending` means delivery is uncertain: investigate before any manual resend to avoid duplicate messages.

Approval and an outbox entry are recorded in the same transaction. A scheduled worker revisits entries that have never been sent while configuration is missing. It rechecks consent, current seller approval, current verification submission and verified mobile before submitting the template. Provider credentials and private phone data are not logged. Account closure removes WhatsApp preferences and the seller's claimed-place reservation; normal erasure review still applies to other records.

## Test checklist

- Pending/rejected seller: no checkout, no product create or update; no new public product listing.
- Approved unpaid seller: free discovery where otherwise eligible; no charge until choosing product access. Paid or valid complimentary seller can add products.
- Claim: correct Google listing selected; altered, expired or another user's selection rejected; incomplete address falls back to full-address search. Two applicants cannot both have the same place approved.
- Seller opts in: approve with current ID, selfie and verified phone; verify outbox and approved template in an isolated account. Repeat with opt-out, changed phone, rejected seller and a superseded submission; no WhatsApp request should be made.
- Android and iPhone: verify registration, review, product and price screens, links, store billing behaviour and actual notifications with physical devices. Firebase and Meta credentials are not included in source.
