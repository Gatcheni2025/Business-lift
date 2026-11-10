# Independent security review request — Teyza Pay browser replacement

**Not approved. No independent analyst verdict is recorded.**

## Exact sample to review
- GitHub PR: https://github.com/Gatcheni2025/Business-lift/pull/130
- Source branch: `security/teyza-pay-browser-clean-rebuild-20261110`
- Source file: `web/app-first/public/js/seller-web-billing.mjs`
- Matching mirrored file: `js/seller-web-billing.mjs`
- Source SHA-256 (verified by Windows PowerShell, 10 November 2026): **`833EF88A38B28DC958AE63CFD307D15D41F092B3370F8D8E28FC0D163FF23E21`**
- Source Git blob SHA-1 (before latest hardening, not equivalent to the SHA-256): do **not** use an old blob hash for approval.
- Git commit containing this source: `8a486b30c1768808e0223b353939dedc168cf433`

## History and scope
The original bundled Teyza payment JavaScript was detected by Windows Defender as `Trojan:JS/Tisifi.A` (threat ID `2147713092`) on 6 and 9 November. Microsoft submission `ac42e314-aef7-4cc8-accd-e97b46944b3d` was *In progress* for an older sample. The previously published `/pay` portal has since been rolled back to the disabled holding page; HTTP 200 and the former `Business payments.` string were observed after rollback.

On 10 November, the operator fetched this exact replacement through a detached Git worktree, obtained the SHA-256 above, ran `Start-MpScan -ScanType CustomScan -ScanPath $file`, and inspected `Get-MpThreatDetection` filtered to the review directory. No new matching detection was returned. This is **endpoint evidence, not Microsoft analyst clearance**.

## Review requested from Microsoft or an independent qualified malware analyst
1. Independently fetch the exact file at the specified commit; verify SHA-256 before any analysis.
2. Examine for malicious code, obfuscated execution, exfiltration, suspicious host destinations, unexpected credential access, injected dependencies, malicious source/build modifications, and the original Defender detection family.
3. Review Firebase Auth SDK imports from `www.gstatic.com`, UID-bound requests to the fixed Teyza service, Paystack host checks, session-only pending reference, origin policy and CSP on `/pay`.
4. Examine surrounding Git history and the original flagged archives for potential compromise; assess whether backend, admin tools, keys, browser session tokens, or the build process could also be affected.
5. Review the exact shipped artifact and deployment-tool dependency tree, not only the single JS file; document detection engines, signatures and versions used.
6. Record **verdict (clean / malicious / inconclusive)**, analyst identity and date, SHA-256, evidence, and remediation required. Keep checkout disabled unless an authorized security owner signs off.

## How to submit without sharing credentials
- An authorized operator can use https://www.microsoft.com/wdsi/filesubmission to submit the **exact file bytes**, referencing the prior incident and SHA-256. Do not upload account credentials, production service keys, or private financial/identity records.
- Do not disable real-time antivirus, add exclusions or relabel the hash to force CI green.
- Submission ID for this exact SHA-256: **NOT YET PROVIDED**.
- Analyst final verdict: **NOT YET RECEIVED**.
- Deployment/checkout release decision: **BLOCKED**.

## Additional necessary release gates
- Separate dependency update + regenerated lockfile and review.
- Mocked browser end-to-end authentication tests (account switching, backend verification, pending payment return), then an authorized test with real seller identity.
- Backend invoice/webhook idempotency and Paystack-reported renewal date validation, policy review and approved controlled R10 charge.
- Keep `TEYZA_SELLER_PAYSTACK_ENABLED=false`; do not deploy this branch until approval.

## 10 November CI evidence update (not independent malware clearance)
- Synthetic Playwright browser scenarios ran and **3/3 passed**: original Firebase seller UID login, delayed-response account switch, and server-verified pending Paystack return. GitHub Actions: https://github.com/Gatcheni2025/Business-lift/actions/runs/42780964149.
- Existing seller payment JavaScript unit tests **10/10 passed** in the same job.
- The complete website CI passed on the hardened source, but the separate legacy fingerprint security job still fails, as intended, pending approval of exact new source SHA-256.
- Separate dependency PR: https://github.com/Gatcheni2025/Business-lift/pull/131. CI regenerated a candidate lockfile, passed its unit/Hosting tests and reported **0 high, 14 moderate** in `npm audit --omit=dev`. Artifact available in GitHub Actions run https://github.com/Gatcheni2025/Business-lift/actions/runs/42780309290. The regenerated lockfile is not yet committed or approved.
- Synthetic browser tests **do not** prove live Firebase Auth provider configuration, a real webhook, or Paystack next-payment scheduling.
