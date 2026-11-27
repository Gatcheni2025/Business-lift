# Teyza payment portals — source review (PR #185)

**Status: Operator source SHA-256 sign-off recorded on 2026-11-19; CI and scoped live publication verification remain mandatory.**

The Teyza membership and advertising websites are payment-related, so the previous source SHA-256 approvals from PR #173 and PR #177 do not transfer to PR #185. The existing website readiness workflow deliberately fails closed when these exact bytes differ.

## Canonical Git UTF-8 / LF content fingerprints

| File | Approved SHA-256 (canonical Git LF bytes) |
| --- | --- |
| `web/app-first/public/pay.html` | `9a345cd4ae757e4c27d46dd360d6fdbecb9a4f7a3801998f3608c188bd703d54` |
| `web/app-first/public/pay/index.html` | Same reviewed bytes as `pay.html` |
| `web/app-first/public/js/seller-web-billing.mjs` | `b7c13588efb5b43836723e4b1eb2227e3246076e6938aca8200714261f0eee17` |
| `web/app-first/public/ads/index.html` | `c75135506ed813f699840c4d3994ccbd70f5fbc5485c3abb0b4540c7119c2b7c` |
| `web/app-first/public/js/ads-web-billing.mjs` | `2976df5040849dd385b88c24cbc7bdaab3c7eb2a566d9175493ff48ad1a88097` |

The exact reviewed file fingerprints and deterministic CRLF representations are pinned in the existing operator-approval JSON files. Those JSON files retain the previous approvals for audit history. This is **operator review only, not an independent antivirus verdict**.

### Existing email-only sellers — transition decision

The redesign keeps Google, Facebook and Apple as prominent sign-in methods and does **not** enable new email/password registration. A small collapsed **Already registered with email? Existing sellers only** sign-in remains temporarily accessible to avoid stranding existing sellers. Once authenticated, owners can call Firebase `linkWithPopup` to attach a supported provider **to their existing UID**. Provider collisions are never auto-merged and require verified support. Existing email credentials remain usable during migration; do not delete or reassign Firebase accounts.


## What was changed

- Premium mobile-first Teyza brand treatment, accessible high-contrast sign-in provider buttons, clearer onboarding links and membership benefits.
- Remove email/password as the primary sign-in UI, placing legacy-only login in collapsed disclosures. Keep existing sign-in handlers and add same-UID provider linking, with no email registration.
- Existing Google, Facebook and Apple Firebase sign-in providers remain available for previously registered users, preserving the original Firebase UID.
- Local ad creative preview: JPEG or PNG, smaller than 2 MB, object URL revoked when changed; upload remains server-checked only after authenticated submission.
- Update website HTML checker to recognise the social-only membership login.
- Preserve Paystack server verification, recurring R99 membership amount, proration quote, seller ownership checks, ad moderation and R29 + R2/km pricing.

## Not implemented by this PR

**WhatsApp OTP authentication is NOT live.** The existing opt-in WhatsApp seller welcome/menu is a messaging service, not an authentication provider. This UI gives clear information instead of a fake WhatsApp login. A future OTP service requires Meta-approved authentication template, short-lived server-issued OTP, rate limits, independent verified phone/owner matching, audit and exact-existing-Firebase-UID binding.

## Release safety gates

1. Operator requested source sign-off on 2026-11-19; the reviewed exact SHA-256 values have been pinned in the payment and Ads approval manifests.
2. Rerun full website and dedicated payment/ads security tests. **All required jobs must pass**; do not bypass check failures.
3. Use `node tools/app-first-release/publish-payment-portals-only.cjs --check` and `--publish` after merge, on an authenticated local Firebase CLI; the script checks all five files and preserves a rollback version.
4. Verify HTTPS /pay.html, /pay/, and /ads/ on mobile/desktop, including legacy account sign-in/provider linking, correct seller UID, prorated membership, ad pricing/review, Paystack return and duplicate-payment protections, plus unchanged /admin.

Publication remains conditional on green CI and a successful scoped Hosting check. No full-site deploy or backend changes are authorised.
