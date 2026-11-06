# Teyza: Defender and store review preparation

This is an investigation aid. It does not approve a release, initiate a payment,
or claim that the detected files are safe. The hold in
`docs/TEYZA_SELLER_SECURITY_REVIEW.md` remains in effect.

## Microsoft analyst submission

An authorized owner can sign into [Microsoft Security Intelligence file submission](https://www.microsoft.com/wdsi/filesubmission),
choose **Software developer**, and submit each exact source file separately for analysis.
Use an isolated, protected environment. Do not restore a quarantined ZIP, override
Defender, or submit secrets or customer data. If a source file cannot be accessed
without bypassing Defender, ask Microsoft Support for a safe submission method.
Record the submission ID and final analyst determination for each sample.

Samples from the reported artifact, represented at commit
`f48a9576b9f43310acb7a0d783ea4118f19700e5`:

| Repository file | SHA-256 |
| --- | --- |
| `web/app-first/public/js/seller-web-billing.mjs` (packaged as `public/js/seller-web-billing.mjs`) | `82f8e042d9346a34ab410fbe75f858a32c71ba8c190e3b44bc9e243f4d07506e` |
| `services/teyza-mobile-v39/billing-paystack.test.js` | `0a348d6373f61ef4a222fd217813dea9ed31f14b105f6ffbc9588534e0a19ef3` |
| `tools/app-first-release/seller-web-billing.test.cjs` | `72d6c4a1c4b57dc34aab2c9deddefa8ac7aecb32d0b592995c83ebf9d8411bab` |

Suggested factual description for each submission:

> Windows Defender reported `Trojan:JS/Tisifi.A` in this source file inside a
> Teyza release archive on 6 November 2026. Please analyze the exact submitted
> file and advise whether the detection is valid. The website file implements a
> Firebase-authenticated Paystack checkout; the two test files contain synthetic
> fixtures and intentionally invalid URLs. The source was reviewed without
> executing the detected files. No claim of a false positive is made.

The GitHub workflow `teyza-defender-source-review.yml` attempts to scan the
three source files with Defender on an ephemeral Windows runner, after checking
their hashes and the scanner's status and signature age. If the hosted image
has broad C: or D: exclusions, the workflow removes those exclusions **only on
that disposable runner** so Defender can scan the files; it never changes the
owner's computer or adds exclusions. Any other exclusions stop the job. An unavailable scanner,
failed checkout, stale signatures or detected threat is **not** a clean result.
Even a clean source scan is not a scan of the original ZIP and is not Microsoft's
final analyst determination.

## Questions for Apple and Google review

The current seller subscription is an optional, recurring **R49 eligible first
month, then R99 per month**. Approved sellers use it to add and publish products
and use related digital selling tools in a marketplace that also lets shoppers
buy physical groceries. Registration and approved shop discovery can be free.
Paystack is also used separately for payments for physical goods.

Suggested question, to be sent by the account owner through the relevant store's
support channel:

> For a South African app with both shoppers and independent merchants, does a
> monthly merchant membership that unlocks product listings and selling tools
> require your in-app billing system? If the same membership is purchased through
> our independent website using Paystack, may an existing subscriber access those
> features in the store-distributed app without an in-app purchase option? Does an
> external purchase link or other programme apply to our app and region? Please
> distinguish this membership from shoppers' payments for physical groceries.

Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
and [Google Play's payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
govern the final implementation. A website purchase or seller-only label does
not by itself establish an exception. Until the relevant purchase model is
confirmed and implemented, store builds keep the external checkout link off.

## Signing and rollout

The separate PR #97 Android *test* key cache is not visible on the current PR,
so that test-APK job cannot create an APK compatible with its existing testers.
Do not generate a substitute key. The production signing workflow uses separate
existing Play upload and Apple distribution credentials and its own safeguards.
Do not bypass the backend-health gate, relabel a QA build as production, upload
to TestFlight, deploy the payment backend, or start a real charge while the
security hold and release gates remain unresolved.
