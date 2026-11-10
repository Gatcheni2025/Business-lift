# Teyza security remediation — 10 November 2026

Status: **QUARANTINED, NOT APPROVED, DO NOT DEPLOY OR ENABLE PAYMENTS.**

## Suspected incident
Windows Defender detected `Trojan:JS/Tisifi.A` in a Teyza release archive. Microsoft submission `ac42e314-aef7-4cc8-accd-e97b46944b3d` remains in progress; the 6 November sample predates the 9 November changes. We are assuming compromise for containment, not claiming confirmation or false positive.

## Immediate production containment (operator)
- The suspect /pay browser module was deployed on 10 November. **Roll back the scoped Firebase Hosting release now** from the machine where the original deployment backup exists:
  `node tools/app-first-release/pay-site-patch.cjs rollback`
  Run this only from the same authenticated checkout/working tree where `teyza-pay-website-backup.json` was written, and only if this scoped release remains live. The script refuses to undo a newer release.
- If rollback is impossible due to a newer Hosting version or a missing backup, use an independently reviewed emergency maintenance release; do not copy suspect JavaScript into that release.
- Keep `TEYZA_SELLER_PAYSTACK_ENABLED=false`. Do not conduct R10 tests.
- Preserve the affected files, deployment artifacts, SHA-256 hashes, and log evidence. Do not disable Defender or grant exclusions.
- Review authentication logs, web/CDN access logs, Paystack audit logs, and privileged access around the publication. Rotate secrets only when exposure or compromise risk is assessed, via a planned incident-response sequence.
- Enable 2FA on the Paystack merchant dashboard.

## Replacement candidate
This branch replaces `web/app-first/public/js/seller-web-billing.mjs` with a small hand-written module retaining required sign-in, exact UID checks, billing display, server-only verified payment checks and HTTPS Paystack-host validation. It does not store card data or payment secrets. It remains **untrusted until reviewed**.

The old security audit has a hash pinned to the former browser source and must continue to fail until an **independent reviewer explicitly approves the exact replacement SHA-256**. Never change the stored hash to force a pass.

## Release gate
1. Confirm rollback/containment and assess whether other website, admin and Firebase functions or dependencies were compromised.
2. Independently scan and review the replacement source and its imports; document sample hash, verdict, dependencies and provenance. Microsoft may still be reviewing the old sample independently.
3. Remediate the reported deployment-tool dependency vulnerabilities on a separate locked, reviewed dependency update.
4. Run browser, backend, security, and integration checks against the replacement commit. Re-run Defender endpoint scanning and ClamAV; no single scanner is conclusive.
5. Use read-only Firebase Hosting inspection before any new scoped deploy; verify that neither admin files nor unrelated rules change.
6. Confirm Paystack live plan code, R99/interval/currency, webhook signature delivery, and **gateway-reported first renewal date**. Do not assume a returned subscription code proves its billing date.
7. Keep checkout disabled until independent approval, app-store policy clearance and separately authorised controlled test. Verify R10, exact seller UID, paid entitlement, app refresh, idempotent webhook, renewal date and cancellation.
