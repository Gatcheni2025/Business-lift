# Teyza WhatsApp OTP login — restricted single-seller pilot

**Status: DRAFT / DISABLED.** This is a separate authentication channel; it is NOT the already-live seller welcome/MENU webhook and must not be deployed as part of a routine mobile release.

## Architecture and UID preservation

- Existing seller identity: `teyzaSellerAccounts/{uid}` approved, not deletion-pending; `teyzaMobileVerification/{uid}` approved for the same UID; Firebase Authentication phone provider has the same already-verified E.164 number; `teyzaWhatsAppPreferences/{uid}` explicitly opts into **login OTP**, independent from marketing/approval-message opt-in.
- A signed-in owner explicitly activates or revokes login OTP through `/consent` using a recent verified Firebase ID token, Firebase App Check and the restricted pilot UID.
- `/start` sends a short-lived 6-digit OTP using Meta's approved **AUTHENTICATION** template with a **COPY_CODE** button. The Meta WABA template API must show the exact template name, language, `status=APPROVED` and `category=AUTHENTICATION`; successful Meta request acceptance is not proof of delivery.
- `/verify` validates a one-use HMAC OTP digest in a Firestore transaction, rechecks seller ownership and consent, then issues a Firebase Admin custom token for the **same existing UID**; a separate pilot client exchanges that custom token using `signInWithCustomToken`. A mismatching already-logged-in UID is rejected, never merged or switched.
- Challenges expire after 5 minutes, allow at most five attempts and apply 15-minute phone/IP quotas; OTPs and phones are not logged or saved in plaintext. Old challenges are never retried automatically after uncertain Meta outcomes.
- The endpoint uses HTTPS only, explicit allowed origins, request size restrictions and verified Firebase App Check. The separate export `teyzaWhatsAppLoginOtpPilot` is only defined if `TEYZA_WHATSAPP_LOGIN_OTP_ENABLED=1` at deploy time; this flag **must remain OFF** during this PR.

## Before any real-number pilot

1. **Meta operator verification:** Confirm the intended `teyza_auth_otp` template actually exists in the production WABA with category **Authentication**, status **Approved**, language matching the transport (default `en`), matching BODY and COPY_CODE placeholders. Confirm Meta phone-number ID, WABA ID, and token permissions without pasting credentials into a chat or commit. If the existing approved template has a different name, review template mapping before changing the pinned sender.
2. **Backend review:** Confirm the actual Firestore account and phone-verification fields for the one authorised seller, Firestore TTL/index policies, pricing/entitlement isolation, rate limits, App Check attestation and safe cloud-function identity permissions. Verify the caller's IP source under the Cloud Run/Firebase proxy; never trust arbitrary `X-Forwarded-For` headers.
3. **Emulator integration:** Run Node test suites `node --test services/teyza-mobile-v39/whatsapp-login-otp-pilot.test.js services/teyza-mobile-v39/whatsapp-login-integration.test.js tools/whatsapp-pilot/whatsapp-otp-client.test.cjs`, plus Firestore emulator transaction/replay tests and Firebase Auth client tests. Current unit tests are synthetic, not evidence of real-number OTP delivery or Meta approval.
4. **Consent:** Record separate login OTP authorisation while signed into the *original* seller account. Existing `teyza_seller_welcome_menu` WhatsApp marketing opt-in does not count.
5. **Scoped security deployment:** Only after explicit operator approval, bind an independent HMAC secret using Cloud Secret Manager, configure the pilot UID and Meta template; deploy **only** the new optional OTP function. Do not modify or redeploy `teyzaWhatsAppWebhook`, approval workers, Paystack, Hosting `/pay` or `/ads`.
6. **Live acceptance:** From the approved pilot device, begin login, receive the OTP, submit correct/incorrect/expired/replayed codes, verify the same Firebase UID and seller dashboard, test account switch rejection, verify no second Firebase account is created, test consent revocation, and inspect redacted error rates. Do not log/store OTP strings or credentials. Finally verify Paystack seller ownership, admin state and WhatsApp MENU remain unchanged.
7. **Rollout:** Keep disabled for all other sellers; activation requires a separate signed operator decision after the above evidence and reliable delivery monitoring.

## Known remaining limitations

- An **approved Meta authentication template has not been independently inspected in the live Meta account** from this GitHub session; the server's template status query fails closed.
- The user website and published mobile applications intentionally do **not** show a WhatsApp sign-in button yet.
- A separate Firestore emulator test, anti-enumeration review, device-side App Check integration, recovery protocol for a lost/recycled number, security review and real pilot acceptance are pending.
- GitHub compilation success cannot establish OTP delivery. Do not mark the pilot active from CI results alone.

This separate draft PR is not suitable for automatic merge or for production rollout.
