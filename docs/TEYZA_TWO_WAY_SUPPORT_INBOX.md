# Teyza two-way Support Inbox — release and acceptance

## What changes
- **Admin → Support inbox** is now a real messaging layout: left-hand conversation list and WhatsApp/in-app filters, selected thread and reply composer, timestamps, pending Meta delivery status, and 20-second refresh that does not erase an agent's in-progress reply.
- Existing advertising and historical \`wa_...\` support requests are deliberately separated in **Internal support cases**. They remain available for recordkeeping, but old one-way tickets cannot be replied to as if they were live conversations.
- **Dedicated staff portal:** \`https://teyza.co.za/support-inbox.html\`. Support-only staff log in with existing, verified Firebase accounts and can read/reply only to approved opted-in sellers' active WhatsApp agent handoffs.
- Server validates \`teyzaSupportAgent\` custom claims and recent verified sign-in. Full admins retain current access. Agents are not allowed to approve sellers, read identity evidence, manage payment/finance, administer users, or view non-WhatsApp conversations.
- The new UI reuses \`teyzaSupportTickets/seller_<uid>\` and the already-deployed \`teyzaWhatsAppHumanReply\` function; this release does not re-send welcome messages or alter Meta webhook signatures, routes or billing.
- Outbound messages are saved to a private support thread first. Meta delivery is asynchronous: \`accepted\` is **not** the same as \`delivered\`. Do not promise instant support or guaranteed message delivery.

## Scoped deployment (operator on Windows)
Use an isolated, clean worktree on the reviewed release branch, with Firebase CLI authenticated to **business-lift-3c19c**. Do not publish before all required PR checks pass.

\`\`\`powershell
Set-Location "$HOME\Downloads\Business-lift"
git fetch origin
git worktree add --detach "$HOME\Downloads\Teyza-Support-Inbox" origin/release/teyza-ads-web-qa-signed-20261111
Set-Location "$HOME\Downloads\Teyza-Support-Inbox"
npm ci --prefix services/teyza-mobile-v39
npm ci --prefix tools/admin-release
npm test --prefix services/teyza-mobile-v39
npm test --prefix tools/admin-release
\`\`\`

The new inbox requires one backend API action; deploy **only** the existing \`teyzaMobile\` HTTP function before publishing the new UI. Do not redeploy the WhatsApp webhook or human-reply function for this change. Preserve the existing \`services/teyza-mobile-v39/.env.business-lift-3c19c\` environment configuration from the current, reviewed deployment; do not substitute blank values or commit secrets.

\`\`\`powershell
$fb = ".\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js"
node $fb deploy --project business-lift-3c19c --config firebase.teyza-mobile-v39.json --only "functions:teyza-mobile:teyzaMobile" --non-interactive
\`\`\`

Then publish only six scoped Hosting files (three existing admin assets and three new agent-inbox files):

\`\`\`powershell
node .\tools\admin-release\publish-support-inbox-only.cjs check
node .\tools\admin-release\publish-support-inbox-only.cjs deploy
\`\`\`

This publisher clones the active version, verifies all unrelated files and Hosting configuration, and stores a local rollback checkpoint. If and only if that same scoped release is still live:

\`\`\`powershell
node .\tools\admin-release\publish-support-inbox-only.cjs rollback
\`\`\`

Do not use a broad Hosting deploy because other Teyza modules may have newer changes.

## Add a support agent (operator only)
The person must already have an enabled, email-verified Firebase Auth account. Use their **exact UID from Firebase Authentication**, never a displayed WhatsApp number. Do not grant the role to an account with \`teyzaAdmin\`.

\`\`\`powershell
node .\tools\admin-release\support-agent-access.cjs grant "<EXACT_FIREBASE_AUTH_UID>"
\`\`\`

For revocation:

\`\`\`powershell
node .\tools\admin-release\support-agent-access.cjs revoke "<EXACT_FIREBASE_AUTH_UID>"
\`\`\`

The agent must sign out and sign in again to refresh claims. The page enforces a five-minute recent authentication window; refresh the authenticated session as prompted.

## Real conversation acceptance
1. Use one consenting approved test seller. In WhatsApp, send \`AGENT\` to Teyza Meta sender **+27 79 826 1972**.
2. Send a text question. This seller should appear under **Admin → Support inbox** with a WhatsApp channel marker, or at **/support-inbox.html** for an authorised support agent.
3. Open the business conversation. Check the inbound text, timestamp, seller name and channel.
4. Reply with a short, safe, non-payment message. It should appear as a right-aligned chat bubble, then be forwarded by the already deployed \`teyzaWhatsAppHumanReply\` function if the seller's 24-hour customer-service window is open.
5. Verify the reply arrives in the original WhatsApp conversation. If the message shows Meta "accepted" but does not arrive, investigate signed status/delivery receipts before any retry.
6. Check test STOP opt-out, duplicate inbound message IDs, stale session, nonconsenting number, unapproved seller, incorrect agent role, old WhatsApp requests, 24-hour window expiration, and finance/approval access denial.
7. Keep passwords, OTPs, payment links, identity documents and card information out of support chat.

## Separation of concerns
- **Support inbox:** private two-way conversations and authorised agent replies.
- **Internal cases:** email/telephone case notes; former orphan WhatsApp requests kept as legacy records.
- **Ads & product reviews:** ad approval decisions; support messages must not trigger payments or approvals.
