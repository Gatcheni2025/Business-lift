# Teyza operations admin — R3.17

## Access and publication

Open https://teyza.co.za/admin. The public homepage footer includes an Admin login link. Current admin aliases also open the same protected workspace, including admin-payments.html, admin-support.html and admin-users.html. Existing claims-based admin login remains required; links do not grant permissions.

Extract TEYZA_ADMIN_R317_OPERATIONS_KIT.zip, run `firebase login`, then `Set-ExecutionPolicy -Scope Process Bypass -Force` and `.\DEPLOY-OPERATIONS.ps1` in PowerShell. Node.js 22+ is required. The script tests and deploys only the existing teyzaMobile function in the teyza-mobile codebase, preserving its existing verification encryption secret, then publishes the admin Hosting overlay. No Firestore rules, other Functions, signing credentials or account claims are changed.

Backend and Hosting publication are separate operations: if Hosting fails, the compatible backend remains active. Fix the reported problem and run `.\DEPLOY-ADMIN.ps1` to retry Hosting. `.\ROLLBACK-ADMIN.ps1` restores only the prior Hosting version and refuses to overwrite a newer deployment. It does not remove ledger records or revert the backend. Do not deploy the partial public folder as a full website.

The public Admin login link is included in the app-first website source. If the homepage update has not been deployed, use /admin directly or publish the app-first website kit after merging this change. The admin-only Hosting overlay preserves the current public homepage and other website files.

## Seller approvals and images

The existing queue, current identity/selfie inspection receipts, actual Firebase-linked phone checks, exact submission matching, self-review prohibition, rejection notes, immutable review audit and five-minute recent authentication remain enforced on the server. The enlarged image viewer uses ephemeral in-memory blob URLs. Images and identity details are cleared on account change, expiry, navigation and backgrounding. Seller registration completion and listing eligibility retain their existing behaviour; identity approval adds the verified owner badge. This change does not silently change the existing mobile app's selling contract or charge sellers automatically.

## R99 subscriptions and statements

Monthly charge is exactly R99.00 (9900 integer cents). An approved seller, an explicitly checked consent record and a consent/mandate reference are required to issue an invoice. Invoice IDs are deterministic per seller and YYYY-MM, so retries cannot duplicate charges. No automatic invoice schedule is enabled: each month is explicitly issued by an administrator after checking the agreement.

Payments are MANUAL VERIFIED RECEIPTS, not automatic debits or a payment gateway. Administrators must first verify received money in the bank/payment-provider account and enter the unique transaction/receipt reference. References are deduplicated across sellers; partial payments are supported and overpayments rejected. Corrections add compensating ledger entries and preserve the original receipt and audit record. No money is moved, refunded, lent or debited by this software. Automated R99 collection needs a provider account, agreed recurring billing/mandates, signed webhook verification and reconciliation before activation.

Statements list invoice/payment/correction entries in ZAR, with a running balance and print/save-PDF action. They are subscription account statements, not bank statements or VAT tax invoices. Accounts over 500 ledger entries fail closed with an archived-export message instead of presenting an incomplete balance. New seller API `seller_billing_statement` is owner-bound; the current phone binary does not yet display a dedicated statement screen.

## Support

Administrators log requests received via email/another channel, assign priority/status, save internal notes and view note history. Revisions prevent concurrent overwrites. Internal notes are not emails and are never sent to the seller. `seller_support_create` and `seller_support_list` are owner-bound APIs available for a future native support screen; no new phone binary is included here. Sellers continue using support@teyza.co.za until that screen is added. No existing shopper–seller chat is repurposed as admin support.

## Stock finance

The review queue reads the actual existing `teyzaCreditEnquiries/{uid}/requests/{id}` enquiries. Administrators record under review, more information, approval in principle or declined, with a required review note. Approval requires seller approval, enquiry consent and an approved amount no larger than the request. Expected-status checks reject stale or duplicate final outcomes; administrators cannot review their own enquiry. Every outcome is audited. All applications remain `not_disbursed`; no loan agreement, affordability decision engine, bank integration or transfer is created. Complete the applicable lender/finance process outside this tool before any real funding.

## Security and checks

All operations require verified email, the trusted teyzaAdmin claim and authentication within five minutes; phone bootstrap tokens cannot act as administrators. The service verifies revoked tokens at its existing boundary. Private billing/support/finance collections remain denied to direct SDK clients by the existing default-deny rule, while owner-facing API routes bind the current UID. No account is granted admin access by deployment.

Tests cover existing seller approvals/evidence privacy, invoice consent/idempotency, integer amounts, duplicate/partial receipts, corrections, self/cross-account access, stale finance decisions, private internal notes, statement formatting, deployment preservation/rollback and desktop/mobile admin layouts. All test records and images are synthetic. Live backend/Hosting deployment and acceptance with a real authorised admin remain required; no real payment, approval or finance outcome has been recorded during development.

## App membership mandate update

The seller workspace now opens Membership & mandate once per signed-in workspace when no current mandate exists, after a registered shop is loaded. Shoppers are unaffected. Owners can always return through the Membership & R99 mandate button. The form does not block existing verification, products or orders, or silently enrol an owner.

Required fields: name, surname, mobile, personal ID/passport number and attachment, account holder, bank, account number/type, first collection date and monthly day. R99 is fixed server-side; day 1–28 avoids ambiguous short-month dates. Selecting a bank fills its universal branch code, never an account number. Branch codes use the provider reference at https://support.peachpayments.com/support/solutions/articles/47001207209-list-of-universal-branch-codes-sa and should be reconfirmed against the owner’s account. Other allows a supplied code. A current matching personal onboarding ID can be reused; companies still need the signatory’s personal ID/passport. New mandate attachments do not replace company evidence or automatically grant verification.

The server records exact versioned terms, amount/date, timestamp and account-bound signature submission, with encryption for full identity/bank fields, masked account summaries, stale-edit protection and idempotent retries. Admin can inspect the mandate reference, terms, schedule, last four digits and current private ID; each ID view is audited. Owners can replace or withdraw their authorisation. Signed version history remains retained; withdrawal does not erase evidence or execute a provider cancellation.

Status is signed_pending_activation, never bank-verified or collection-active. No debit order instruction, auto-payment, lender approval, placement algorithm, wholesaler contract or bookkeeping service integration is created by this change. Benefits list reflects the requested membership offer; partner discounts/delivery/placement depend on availability, and finance requires separate assessment. The business must fulfil bookkeeping support and other advertised services.

Before actual bank collection, configure the chosen collection provider, registered creditor details/statement descriptor and provider-approved agreement, confirm bank ownership/mandates as required, and implement authenticated collection webhooks and cancellation synchronisation. For DebiCheck the bank authentication is separate from signing this app form (PASA: https://pasa.org.za/pasa-resources/pasa-debit-orders/). No existing signed mandate should be labelled activated until these steps succeed.

Deploy backend/admin with DEPLOY-OPERATIONS.ps1 first, then install/test the new Android build and distribute the new iOS build. The old installed app does not acquire new screens from a backend deployment. Android/iOS source version is 1.0.14+24; CI may assign its own build number. The existing scheduled verification-photo cleanup must remain deployed; new ID images use the same 90-day private expiry index. Full signed mandate details remain encrypted consent records under the existing privacy retention policy, including for a withdrawn mandate.
