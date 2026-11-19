# Teyza payment portals — source review (PR #185)

**Status: PENDING OPERATOR APPROVAL. NOT DEPLOYABLE.**

The Teyza membership and advertising websites are payment-related, so the previous source SHA-256 approvals from PR #173 and PR #177 do not transfer to PR #185. The existing website readiness workflow deliberately fails closed when these exact bytes differ.

## Canonical Git UTF-8 / LF content fingerprints

| File | SHA-256 |
| --- | --- |
| `web/app-first/public/pay.html` | `ad2c70e39186656959ff46ce4e59b6a745288742df13210c97c0c3163f820d89` |
| `web/app-first/public/pay/index.html` | Same bytes as `pay.html` |
| `web/app-first/public/js/seller-web-billing.mjs` | `33e25bd0b40dd64999b4013c496570c1ff956fe788b3dc9691d0e23e5c15e46d` |
| `web/app-first/public/ads/index.html` | `90b74378196a383df577a3706f315f71b6937cbd54e5844adc04003095f4d36b` |
| `web/app-first/public/js/ads-web-billing.mjs` | `b5115d3287b9a5bc50b715330866719d665c4199574393cd1895d63cf4d255af` |

Root `ads/index.html`, `js/seller-web-billing.mjs`, and `js/ads-web-billing.mjs` must remain byte-identical to their app-first Hosting counterparts. Source SHA-256 values were computed over canonical UTF-8 LF bytes; **a Windows CRLF worktree may produce a different hash**. Calculate SHA-256 on Git canonical bytes or document line-ending equivalence if approving Windows copies.

## What was changed

- Premium mobile-first Teyza brand treatment, accessible high-contrast sign-in provider buttons, clearer onboarding links and membership benefits.
- Remove visible `email/password` inputs on both payment pages and remove the corresponding front-end sign-in handlers.
- Existing Google, Facebook and Apple Firebase sign-in providers remain available for previously registered users, preserving the original Firebase UID.
- Local ad creative preview: JPEG or PNG, smaller than 2 MB, object URL revoked when changed; upload remains server-checked only after authenticated submission.
- Update website HTML checker to recognise the social-only membership login.
- Preserve Paystack server verification, recurring R99 membership amount, proration quote, seller ownership checks, ad moderation and R29 + R2/km pricing.

## Not implemented by this PR

**WhatsApp OTP authentication is NOT live.** The existing opt-in WhatsApp seller welcome/menu is a messaging service, not an authentication provider. This UI gives clear information instead of a fake WhatsApp login. A future OTP service requires Meta-approved authentication template, short-lived server-issued OTP, rate limits, independent verified phone/owner matching, audit and exact-existing-Firebase-UID binding.

## Release safety gates

1. Have the authorised operator review PR #185's exact 5 live source files (including the two scripts).
2. Obtain explicit new source approval for updated canonical SHA-256 fingerprints and update the existing payment/Ads operator approval manifests under separate audited review. **Do not silently change approvals or bypass their CI checks.**
3. Rerun full website and dedicated payment/ads security tests. All required jobs must pass.
4. Publish only the 5 changed Hosting resources after verifying the current live Hosting release and untouched file hashes, preserve a rollback version.
5. Verify HTTPS /pay.html, /pay/, and /ads/ on mobile and desktop, including social account ownership, proration, ad creation/review, payment return, duplicate prevention and unchanged /admin.

Until these conditions pass, PR #185 remains a draft and **must not be deployed**.
