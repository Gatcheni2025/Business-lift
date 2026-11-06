# Teyza seller website checkout — security review record
**Status: QUARANTINED/NOT APPROVED FOR PRODUCTION.** This record does not claim a false positive, that the source is malware-free, or that antivirus protection should be overridden.

## Evidence provided by the seller's Windows Defender (6 November 2026)
- Threat: `Trojan:JS/Tisifi.A`; ThreatID `2147713092`; severity `5`.
- Defender reported `IsActive=False`, `DidThreatExecute=False`, and `ActionSuccess=True`. This is **not** a finding that the ZIP is safe.
- November 4 admin archive: flagged `services/teyza-mobile-v39/billing-paystack.test.js`.
- November 6 website archive: flagged `public/js/seller-web-billing.mjs`, `services/teyza-mobile-v39/billing-paystack.test.js`, and `tools/app-first-release/seller-web-billing.test.cjs`. Console output was truncated, so additional flagged members are possible.

## Independently verified release-artifact provenance
The exact GitHub Actions artifact `13510067984` (run `42233857570`) contains one nested 188-file ZIP. A non-executing ZIP parser verified every SHA-256 manifest entry, found no path traversal and matched the three flagged files' **Git blob SHA-1 identifiers** to the current reviewed GitHub tree:
| Flagged source file | SHA-256 | Verified Git blob SHA-1 |
|---|---|---|
| `public/js/seller-web-billing.mjs` | `82f8e042d9346a34ab410fbe75f858a32c71ba8c190e3b44bc9e243f4d07506e` | `ad732ba05a88bcde663986e9c4905d9a96dfaef1` |
| `services/teyza-mobile-v39/billing-paystack.test.js` | `0a348d6373f61ef4a222fd217813dea9ed31f14b105f6ffbc9588534e0a19ef3` | `b6b48ee206c1b5ce9bea001c702b5b921248951a` |
| `tools/app-first-release/seller-web-billing.test.cjs` | `72d6c4a1c4b57dc34aab2c9deddefa8ac7aecb32d0b592995c83ebf9d8411bab` | `6943a11eaa3b4b9d2b61a8b1a73688c36149065d` |

## Read-only static review
Reviewers inspected the three files **as data, without executing the JavaScript**. Current visible behavior:
- `seller-web-billing.mjs` uses pinned Firebase SDK modules from Google's `www.gstatic.com`, exchanges Firebase ID tokens with the fixed Teyza Firebase API, validates HTTPS `checkout.paystack.com` checkout URLs, and only stores a short Teyza checkout reference and timestamp in sessionStorage. No embedded Paystack secret. No visible `eval`, dynamically constructed Function, native process execution or arbitrary redirect from server-supplied user input.
- `billing-paystack.test.js` is a Node test suite with synthetic `sk_test_...` strings, signed webhook fixtures, simulated bad callbacks, fake payment references and test-only URLs. Mocked negative samples such as `https://checkout.paystack.com.evil.test` are deliberate security assertions, not intended contacts; tests run in CI, not in production.
- `seller-web-billing.test.cjs` contains deliberate URL-validation negative tests with `javascript:alert(1)`, malicious lookalike Paystack hosts and invalid payment references.
- `services/teyza-mobile-v39/billing-paystack.js` uses server-side Paystack API host `https://api.paystack.co`, server-side secret retrieval, locked checkout references and signed webhook validation. It keeps key material on the server, not in the website module.
- This source inspection does not exclude sophisticated injection, compromised dependencies, malicious upstream imports, supply-chain issues or Defender signature-specific detection.

## Corrective packaging work
The old release bundle combined two nested ZIPs, duplicated the website source tree, and included test suites despite them being unnecessary for production. The new **security-review candidate** has exactly one inner release ZIP, no `*.test.js`, `*.test.cjs` or `*.test.mjs`, no duplicated website source tree, no `node_modules` or private credentials. The source checkout retains the security tests, which continue to run in CI. The production website module remains in the candidate; **removing test files does not clear Defender's finding**.

The candidate is generated reproducibly by `scripts/package_teyza_seller_security_candidate.py` and inspected by `scripts/audit_teyza_seller_security_candidate.py`. These are structural / static reviews, not malware-detector verdicts. CI also runs an independent ClamAV signature scan against the exact flagged source files and candidate. A **clean ClamAV result does not override Defender**.

## Required independent verdict (NOT YET RECEIVED)
1. The owner or an authorized software-security officer signs in to [Microsoft Security Intelligence File Submission](https://www.microsoft.com/wdsi/filesubmission) as a **Software developer** and uploads **each flagged source file individually**, not the entire ZIP, using a separate clean, isolated submission environment. No need to restore Defender-quarantined files on the production PC; the repository contains the source. Do not bypass antivirus or add Defender exclusions. The source submission may be considered confidential, so ensure the uploader is authorized.
2. Include the three SHA-256 hashes, detection name, detection date, GitHub commit, evidence that the testing scripts use inert fixtures, and user's PowerShell resource paths. Choose the appropriate review/request classification; **do not assert a false positive as a proven fact**.
3. Save the Microsoft submission IDs and the final analyst verdict. If Microsoft confirms malware, investigate repository history, dependencies, build machine, credential exposure, live deployments, and affected clients before any further release. Rotate credentials only through a scoped incident response, not by blindly overwriting shared Paystack secrets.
4. When the files are cleared or corrected, re-run the full backend, Firestore rules, admin, website and ClamAV CI checks against the exact candidate commit and scan the downloaded candidate on a protected endpoint. Only then can the release be reviewed for approval.

## Do not do
- Do not download, restore, unzip or execute the Defender-blocked GitHub Actions artifacts on the owner PC.
- Do not disable antivirus, whitelist the source, or rename/encode suspicious files to evade scanning.
- Do not publish the current website, rules or backend; do not initiate a real R49 charge.
- Do not label a clean static scan, ZIP hash, ClamAV result or passing test suite as an independent Microsoft malware clearance.

## Release gating after clearance
Follow `docs/TEYZA_SELLER_WEBSITE_PILOT_RELEASE.md`. Rule diff and emulator, existing Paystack merchant/key/subscription reconciliation, signed webhooks, website backend health 3.25.0, consented R49 transaction and correct R99 renewal must still be verified.
