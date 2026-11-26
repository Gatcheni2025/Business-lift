# Teyza agent welcome email — isolated Zoho pilot

## Scope

Welcome email only. Existing mobile app, authenticated Work submission, payment and Admin endpoints are unchanged. A separate scheduled Firebase worker reads completed applications from the existing teyzaFieldAgents collection. It processes verified applicants in bounded batches every minute, with a daily reconciliation rescan. The application never waits on Zoho. This is independent of the app release. No marketing blasts, approval/payment messages or Admin UI are deployed by this change.

The worker uses one private delivery record per Firebase UID (teyzaAgentWelcomeMail/{uid}). It stores status, attempts, timestamps and provider message ID, not the address, ID documents, CV, photos or email body. It obtains the current verified address from Firebase Auth before sending. Unverified or absent email goes to blocked_email and is rechecked after 12 hours; do not create an account or change its email on behalf of an applicant. Help the applicant verify their own address. A qualifying pending or approved profile must have application evidence and a numeric createdAt within the approved rollout window. Rejected, suspended, missing or disabled accounts are not mailed. Existing UID and ledger are never reset for a new application revision.

## Step 1 — Zoho authorization and one test email

Sign in as support@teyza.co.za, the proposed sender, with Zoho Mail API permissions. Identify the actual data centre from the mailbox URL; this implementation supports us, eu, in, au, jp and ca. Do not assume US if your mailbox uses a different domain. In the matching Zoho API Console create a Self Client, then generate an authorization code with scopes ZohoMail.accounts.READ,ZohoMail.messages.CREATE. Use a sufficiently long code expiry while entering the local prompts. The official setup references are:
- https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html
- https://www.zoho.com/mail/help/api/get-all-users-accounts.html
- https://www.zoho.com/mail/help/api/post-upload-attachments.html
- https://www.zoho.com/mail/help/api/post-send-email-attachment.html

Download the reviewed Teyza_Field_Agent_Training_Manual.pdf to your own PC. Use that exact manual, not recruitment documents or a draft. In a clean reviewed checkout, install the existing deployment kit if necessary:

    npm ci --prefix tools/app-first-release --omit=dev --ignore-scripts --no-audit --no-fund
    .\SETUP-TEYZA-AGENT-MAIL.ps1 -ManualPath "$HOME\Downloads\Teyza_Field_Agent_Training_Manual.pdf"

The setup script requests a deliberate TEST confirmation, then asks for credentials via masked local prompts. It exchanges the code using Zoho's token endpoint, finds the confirmed official mailbox, uploads the approved manual to Zoho, and sends exactly one internal [TEST] email to support@teyza.co.za. After provider acceptance it pipes the credentials into TEYZA_AGENT_MAIL_ZOHO in Firebase Secret Manager. Never paste the grant, client secret, access token or refresh token in chat, GitHub, public site files, screenshots or shell history. If the internal test is accepted but writing the secret fails, check the inbox before rerunning; setup may send a second self-test. Verify the actual received email and PDF in the Zoho mailbox before deployment. Provider acceptance is not delivery.

## Step 2 — deploy isolated worker with sending disabled

Check the production Firestore rules in Firebase Console: new teyzaAgentWelcomeMail and teyzaAgentMailSettings collections must deny all client reads/writes; the checked-in baseline already denies unmatched collections. Do not replace the live ruleset. Restrict operator access to authorised staff. Verify teyzaAgentMailSettings/control does not exist or its enabled field is false.

    .\DEPLOY-TEYZA-AGENT-MAIL.ps1 -ManualPath "$HOME\Downloads\Teyza_Field_Agent_Training_Manual.pdf"

The deployment stages the locked existing dependencies, the standalone worker entrypoint and the reviewed PDF in a temporary directory, runs unit tests and deploys only functions:teyza-agent-mail to business-lift-3c19c. It must not delete/update the mobile, billing, WhatsApp, Hosting or existing notification functions. No public API is added. Verify the single function teyzaAgentWelcomeMail in Firebase Functions and its scheduler in Google Cloud. A separate codebase is necessary for safe isolated deployment. No applicant emails while the control is absent or disabled.

## Step 3 — explicit rollout and acceptance

Before enabling, confirm the approved sender and manual; confirm which applicants should be included, including whether applicants who applied earlier have received welcome mail manually. This worker cannot infer previously sent manual emails. Seed or reconcile ledger records for those applicants before including them. Use a limited first rollout. In Firebase Console, as an authorized operator, create/update document teyzaAgentMailSettings/control with:
- enabled (boolean): false until actual authorization to start automatic applicant emails
- startAt (number): exact Unix epoch milliseconds for the approved cohort (choose a cutoff using [DateTimeOffset] in PowerShell, do not guess dates)
- maxPerRun (number): 1 for initial pilot; after checking the first outcomes, up to 5.

Example of calculating a cutoff for 26 Nov 2026 SAST midnight, only if that cohort is explicitly approved:

    [DateTimeOffset]::Parse('2026-11-26T00:00:00+02:00').ToUnixTimeMilliseconds()

After confirming recipient cohort and internal test, set enabled=true. The worker sends individually, not as a CC/BCC distribution. It scans committed profiles and sends within subsequent scheduled runs, subject to queue volume and provider availability. Confirm an eligible test applicant's welcome is actually received, attachment opens, duplicate submission produces only one ledger record, an unverified email is held, a rejected account is not sent, and source application/approval/payment flows are unaffected. Then widen the startAt only if older applicants are explicitly authorized. Daily rescan catches missed profiles; new applicants beyond the saved scan cursor are found in subsequent runs. Pending blocked_email jobs are rechecked after 12 hours.

## Monitoring, retry and stop

Use the private delivery ledger teyzaAgentWelcomeMail in Firebase Console until a dedicated Admin communications screen is implemented. States: queued, preparing, retry (safe preparation failure), blocked_email, sending, sent (Zoho accepted, not proof of inbox delivery), cancelled, review_required. An uncertain send or abandoned sending lease never automatically retries; reconcile the message in Zoho Sent first, then only an authorized operator may reset that record for a known failed send. Never blindly delete the UID ledger or resend if uncertain. Pre-send failures back off, and after five attempts need review. A job in sent is not requeued by later application edits. Set enabled=false to pause new work; an already-transmitted send cannot be recalled. Changing Zoho credentials requires redeploy of only this codebase; revocation is available through Zoho. Monitor provider sending limits and Firebase billing, and use the smallest pilot initially.

Do not claim emails have been sent to applicants until the ledger, actual mailbox checks and rollout verify them. A user who has only a phone-verified account is not forced through a broken signup: the existing application succeeds, and email remains blocked until verified. Adding a verified contact-email UI and an Admin communications dashboard (including explicit existing-applicant selection and status/outcome notifications) is a separate follow-up. No reward or payment automation has been added.

## Troubleshooting mailbox authorization

Use the mailbox's actual regional domain (not merely the API Console URL) and sign in to the Zoho user authorized to send as support@teyza.co.za. Use the same two least-privilege scopes, not ALL. Generate a new single-use grant after each attempted exchange. The setup now reports fixed error categories only: HTTP_401 (token/scope), HTTP_403 (account/API permissions), REDIRECT (check regional URL), DNS/CONNECTION/TLS/TIMEOUT/NETWORK (local connection), NON_JSON (unexpected server or intermediary response), and SENDER_NOT_FOUND (authorized account does not expose the intended sender). No raw Zoho response or credential is printed. A successful token exchange does not prove the mailbox API is available; check the mailbox's plan, organization policy and authorized sender. Do not retry uncertain send outcomes until you check Sent Mail. See https://www.zoho.com/mail/help/api/get-all-users-accounts.html and https://www.zoho.com/mail/help/api/getting-started-with-api.html.
