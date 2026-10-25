# Teyza R3.14 — mobile verification and selfie return

Flutter **1.0.12 (22)** uses the already activated **3.13.0** mobile service.
This is a client update. It does not require another function deployment,
encryption-key change or Firestore rule change.

## Android phone verification

The R3.13 APK's merged manifest contained the SDK's correct `RecaptchaActivity`
filter (`recaptcha://firebase.auth/`) but Flutter's main activity had an empty
`taskAffinity`. That combination can leave the browser in a different task.
The wrapper preparation removes the empty affinity, following Firebase's native
browser-return guidance, and leaves reCAPTCHA callback handling with its SDK.

The activated project's real native Firebase IDs are bundled as public
configuration. The wrapper generator uses the same file when CI variables are
empty, so native resource initialization and the iOS encoded callback scheme
are configured before Dart startup. Explicit CI app IDs remain supported and
must identify the existing project.

The received verification session is retained in encrypted device storage for
ten minutes, bound to the existing owner UID and normalized mobile number.
Reopening the OTP page restores code entry without sending another SMS. The SMS
code is never stored. Confirmation still uses Firebase's real verification and
links the phone to that same account. Success or account change clears the
pending request; expired or mismatched requests cannot be restored. A three-minute
UI timeout does not discard a late callback unless a newer request replaced it.

## In-app owner selfie

Selfies use the official Flutter camera plugin inside Teyza. The front lens is
selected explicitly; a device without one gets an actionable message. Audio is
disabled. The owner takes a photo, previews it, retakes it if necessary and
chooses **Use this selfie** to return to registration. Existing explicit upload
consent and server-side private encryption remain required. Nothing uploads
automatically, and no biometric identity match is claimed by camera capture.

Camera operations are serialized. The camera releases on backgrounding and
reopens on resume. Switching accounts prevents late initialization/capture
results from displaying or returning private bytes. Temporary capture files are
deleted after reading. The working ID/passport/company document picker is retained.

## Device acceptance

1. Install the replacement APK over the existing app and use the same seller.
2. Request a real SMS, complete any Firebase security check, and verify that the
   app returns to its code field. Also switch to Messages and back, and close and
   reopen the OTP page before entering a still-valid code.
3. Capture a front-camera selfie, review/retake it, choose **Use this selfie**,
   consent and submit. Test cancellation and camera permission denial/recovery.
4. Confirm the ID/passport flow still works; complete setup and check the real
   selected products as a shopper.
5. Test background/resume and an account change while camera/OTP work is pending.

The test APK must retain the certificate registered by the activation kit. Verify
its exported fingerprints against R3.13 before distribution. Store releases need
the actual Play/App Store signing and device checks. iOS native identity and URL
scheme are configured; APNs, distribution credentials and physical-device OTP
acceptance are still required.

References:
- https://github.com/firebase/flutterfire/blob/main/docs/auth/federated-auth.md
- https://firebase.google.com/docs/auth/android/phone-auth
- https://pub.dev/packages/camera
