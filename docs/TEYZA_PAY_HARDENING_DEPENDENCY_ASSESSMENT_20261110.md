# Teyza /pay security hardening and dependency assessment — 10 November 2026

**Status: review candidate only. Not a malware-clear verdict or release approval.**

## Confirmed source and endpoint evidence
- Reviewed branch: `security/teyza-pay-browser-clean-rebuild-20261110` (PR #130). The new replacement source was modified again during this hardening; the previously scanned SHA-256 `590f5d8a60c12bc39dfe39332c13deda9e13106ec8a9869ef72b230307c0134a` is **obsolete for the latest commit**.
- User's Windows Defender CustomScan against the **earlier** exact replacement produced no newly listed detection for the Teyza-Security-Review path. Historic `Trojan:JS/Tisifi.A` detections in November 6 and 9 ZIP artifacts remain. RealTimeProtectionEnabled and AntivirusEnabled both reported true.
- Microsoft submission `ac42e314-aef7-4cc8-accd-e97b46944b3d` was still *In progress* and pertains to an older sample. Neither Microsoft's independent verdict nor endpoint scan of the **latest hardened file** is available.

## Code-level hardening added
- Firebase seller UID **and an auth-state generation counter** must match before asynchronous account status responses, membership confirmation, checkout redirection or subscription management can use a response.
- The Paystack browser return is not payment proof. When a valid original per-UID reference exists and server status is not yet active, the browser invokes `billing_confirm` on the authenticated Firebase backend and then requires `seller_summary.listingPaid`, `seller_billing_overview.paymentVerified`, `status==='paid'` and the same UID.
- Strict HTTPS exact-host checks for Paystack checkout and subscription-management redirect; no card or secret values in the browser.
- The checkout remains gated by server health, Firebase approval and account status, checkbox consent and server-issued reference. No app steering added.

## Dependency audit evidence from owner environment
`npm audit --omit=dev` in `tools/app-first-release` reported **20 findings: 5 high, 15 moderate**. The pinned direct dependency is `firebase-tools@15.30.2`; the reported vulnerable nested packages include `basic-ftp`, `glob`, `minimatch`, `stream-json`, `uuid`, `@opentelemetry/core` and `csv-parse`. npm suggested `firebase-tools@15.35.0` via `--force`, which is **not yet approved**. This audit concerns the local deployment CLI tree, not proof the browser JavaScript imports these packages.

Do not execute `npm audit fix --force` against the signed release. Prepare a separate branch updating `firebase-tools` and its lockfile, review changelogs/advisories and run the Hosting patch tests, then re-audit. Check whether vulnerable code paths are reachable in actual deployment workflows, and review browser SDK origins separately.

## Unresolved release checks
1. Scan **latest** GitHub file bytes (SHA-256 changes with each hardening commit); obtain independent Microsoft/qualified analyst review. Do not replace historic approved hash as a way to turn CI green.
2. Source and behavior review for Firebase SDK imports, sign-in, account switching, pending return and hosted Paystack redirect. Exercise the new tests in CI and run the browser preview.
3. Validate hosted Paystack live subscription after controlled transaction: exact R99 plan and **provider-reported next-payment date**. Website source alone cannot prove the first-of-month schedule.
4. Assess original archive detections, potentially affected backend and authentication exposure, and verify that rollback remains live.
5. Review mobile app-store subscription purchase-policy classification and merchant configuration before allowing checkout.

**Operational constraint:** Keep `TEYZA_SELLER_PAYSTACK_ENABLED=false`; retain the live /pay holding page. No live payments or deployment of PR #130 until the full gate passes.
