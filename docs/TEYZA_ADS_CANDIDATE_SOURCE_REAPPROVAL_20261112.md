# Candidate Teyza Ads website source hashes — 2026-11-12

**Status: NOT APPROVED FOR DEPLOYMENT.** The earlier operator approval for PR #149 is for exact older bytes and MUST remain unchanged. The approved source fingerprint gate is intentionally expected to reject the candidate until the project operator separately approves these updated files.

Change requested: report paid and awaiting admin publication truthfully after Paystack verification, and start the advertising seven-day period only upon the independent admin publish action. The payment origin, checkout URL allowlist, consent checkboxes, Firebase UID check, Paystack signature/verification, and pricing remain in place.

| Candidate source | Canonical Git LF SHA-256 | Windows CRLF SHA-256 |
|---|---|---|
| `web/app-first/public/js/ads-web-billing.mjs` | `74ab14cf9a631b89d71a33dc7ed9c0edcade549b1be561e8b7dbe0954ded0f45` | `aaabf32d13233031bb24541c46a678489b7aa20f1f2d58e4208368092a0195cd` |
| `web/app-first/public/ads/index.html` | `3cd13531ad363bc8e2d591c983a3998138ddc6d7bb39c8b9db5c94c6fecc6e32` | `839e243f3bba779dadd4fbbebbc2448e50d33c44e7d3a54dc7d5c0fa2b01f8ed` |

Root mirrors at `js/ads-web-billing.mjs` and `ads/index.html` are exact matches.

This note is **not** an operator source approval, malware-verdict waiver for new bytes, Paystack enablement, production deployment instruction, or app-store compliance determination. Do not update `docs/TEYZA_ADS_OPERATOR_SOURCE_APPROVAL_20261111.json` or weaken `scripts/audit_teyza_ads_operator_source.py` without renewed explicit operator approval.

Also keep `TEYZA_ADS_WEB_PAYSTACK_ENABLED` disabled until the complete advertising billing path, Apple/Google policies, backend activation queue and refund/exception handling are reviewed.
