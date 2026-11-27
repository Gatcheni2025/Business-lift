# Teyza 1.0.49 (59): signed candidate and release guide

Prepared 25 November 2026. The candidate is **1.0.49+59**, with backend contract **3.26.0**, on review branch `fix/teyza-home-checkout-dashboards-20261125`. Android keeps application ID `com.asiyedriver.asiye`; iOS keeps bundle ID `za.co.teyza.shopper` and its existing Apple distribution identity. The native iOS minimum is 15.0.

The candidate opens the public home before authentication, preserves a guest basket through checkout sign-in, modernizes both dashboards and startup, and adds separate seller controls for online orders and physical-goods payments. It includes the prior registration and WhatsApp changes. See [the implementation and validation record](TEYZA_HOME_CHECKOUT_DASHBOARDS_20261125.md) for the complete scope and remaining checks.

## Preparation status

At preparation, **no APK, AAB or IPA for this candidate has been generated or published**. Passing source tests and uploading a review branch do not establish a signed release. The last recorded live API check, at 17:44 SAST on 25 November 2026, reported **3.25.0** without the new commerce-readiness fields. Recheck the current service and workflow results before proceeding; this snapshot does not claim a later deployment or build succeeded.

The earlier successful signed run [45415655977](https://github.com/Gatcheni2025/Business-lift/actions/runs/45415655977) built **iOS 1.0.48+58** at `a3df18c948b5cf7c96b35b9d62081a911e43530f` and recorded an accepted Apple upload. Its Android job was skipped. The later [45466067075](https://github.com/Gatcheni2025/Business-lift/actions/runs/45466067075) is a successful **unsigned PR preview** of `686c91e32a4e2c2e75824e720d17703bbb02ca49`, not a signed app. Apple upload acceptance does not establish processing completion, tester access or public App Store availability.

## Backend and payment prerequisites

1. Publish `/order-payment-return.html` to the existing website while preserving its current Hosting manifest, files and settings.
2. Deploy the affected backend functions together, preserving their existing environment and secret versions: `teyzaMobile`, `teyzaCatalogueDraftChanged`, `teyzaCatalogueShopChanged`, `teyzaCatalogueApprovalChanged`, `teyzaSellerBillingChanged`, `teyzaPublicationRepair` and `teyzaShopLocationRefresh`. The previous registration-only updater does not contain this commerce update.
3. Verify that the existing Firebase project's mobile health reports **3.26.0**, with `sellerOnlineShoppingControls`, `onlineOrderPaymentReadiness`, `physicalGoodsPaystack` and `sellerPaystackSubaccounts` true. The normal signed workflow also checks the existing registration, catalogue, authentication, Maps and billing requirements. Keep that release gate intact.
4. Check an authorized shop's actual readiness response. An advertised backend capability is not evidence that a particular seller can take payment. New online physical-goods payments require eligible active selling access, seller opt-in to online orders and online payments, collection or delivery, and a verified live settlement connection. The shopper needs a verified account email. The shop confirms stock before the shopper pays; the server verifies the provider result before marking an order paid.

Keep the existing Firebase project, verification encryption key, Places and Maps configuration, Paystack secret and verified R99 monthly plan. This update does not change the R99 digital business membership or optional R29 seven-day promotion. The signed release gate validates the current calendar-prorated first-month membership contract; do not substitute a historical fixed introductory price.

Store-channel apps keep external digital-membership purchases disabled. Shopper payments here are for eligible physical goods; Google Play Billing and Apple StoreKit membership purchasing are not introduced by this update. Production shopper checkout rejects a test payment key. A QA-signed app still uses the production Firebase project and is not a payment sandbox. No real shopper charge, refund, settlement or WhatsApp delivery was performed or verified while preparing this candidate.

## Preserve and verify existing signing identities

The workflow loads the saved Android upload keystore from the existing `TEYZA_ANDROID_*` secrets. `prepare_mobile_release.py` compares its certificate with the repository variable `TEYZA_PLAY_UPLOAD_CERT_SHA256` before signing. Do not create a replacement key or weaken that comparison.

The latest inspected successful signed Android build, [45034339125](https://github.com/Gatcheni2025/Business-lift/actions/runs/45034339125), was a **QA-only 1.0.46+57** build. Its verified APK and AAB used the same upload-certificate SHA-256:

```text
e7aa9602193078e8279614f0bdb361830696a0ac1821e22077ecf8e692c199b7
```

That is historical signing evidence, not a fresh reading of Play Console. Compare the new artifact evidence with the currently configured original upload certificate and the existing Play app before any store upload.

iOS uses the saved `TEYZA_IOS_CERTIFICATE_BASE64`, certificate password, provisioning profile and keychain password, together with the existing `TEYZA_APPLE_TEAM_ID`. The workflow checks that the App Store distribution profile belongs to the same team and `za.co.teyza.shopper`, and includes Sign in with Apple. It exports with manual Apple Distribution signing. Keep the existing credentials; a missing or expired credential is a release failure to resolve, not a reason to generate a different app identity.

## Check build 59 before uploading to a store

The shared version comes from `apps/teyza_shopper/pubspec.yaml`; the normal build commands do not override it. `test_play_version_code.py` requires a code greater than the recorded floor **58** and a version at least **1.0.49**. This is a static repository check, **not a live store query and not proof that 59 is unused**.

Before an upload, inspect the existing app's full Play Console bundle history, including testing tracks and drafts, and the corresponding App Store Connect build history for `za.co.teyza.shopper`. Confirm that Android code **59** has not already been used and that iOS **1.0.49 (59)** is available for a new upload. If there is a conflict, choose an unused higher build number and rebuild the reviewed source with consistent version metadata. Do not relabel an already compiled file.

The inspected GitHub history has no signed build 59 for this candidate. That history cannot rule out an independent Play Console or App Store Connect upload. Store acceptance and store release are separate checks from generating signed artifacts.

## Build signed artifacts with uploads disabled

After the live backend prerequisites pass, dispatch `.github/workflows/teyza-mobile-release.yml` from the reviewed candidate branch. Pin `expected_source_sha` to the **exact reviewed, published 40-character commit SHA**, including any final documentation correction. The workflow stops signing if that branch has moved to another commit.

| Dispatch input | Value for this candidate build |
| --- | --- |
| `signed_release` | `true` |
| `qa_signing_only` | `false` |
| `platforms` | `all` |
| `expected_source_sha` | Exact reviewed commit SHA |
| `upload_to_testflight` | `false` |
| `upload_existing_ios_run` | Empty string |
| `direct_mandate_qa` | `false` |
| `direct_mandate_debug_qa` | `false` |

PowerShell example, after replacing the SHA placeholder:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $teyzaReleaseRef = 'fix/teyza-home-checkout-dashboards-20261125'
    $teyzaReleaseSha = 'REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT_SHA'

    if ($teyzaReleaseSha -notmatch '^[0-9a-fA-F]{40}$') {
        throw 'Set the exact reviewed and published commit SHA before dispatching.'
    }

    & gh workflow run teyza-mobile-release.yml `
        --repo Gatcheni2025/Business-lift `
        --ref $teyzaReleaseRef `
        -f "expected_source_sha=$teyzaReleaseSha" `
        -f signed_release=true `
        -f qa_signing_only=false `
        -f platforms=all `
        -f upload_to_testflight=false `
        -f 'upload_existing_ios_run=' `
        -f direct_mandate_qa=false `
        -f direct_mandate_debug_qa=false

    if ($LASTEXITCODE -ne 0) {
        throw 'The signed build was not successfully requested. Review the error before retrying.'
    }

    & gh run list --repo Gatcheni2025/Business-lift `
        --workflow teyza-mobile-release.yml --branch $teyzaReleaseRef `
        --event workflow_dispatch --limit 5

    if ($LASTEXITCODE -ne 0) {
        throw 'The request may have succeeded, but its run list could not be read. Check Actions before retrying.'
    }
}
```

Keep `upload_existing_ios_run` empty. A nonempty value selects the separate Apple-upload job and skips the normal build and source-SHA gate, even when `upload_to_testflight` is false. Do not set either direct-mandate flag for this store-channel candidate. The workflow cancels an older in-progress run on the same branch, so identify the requested run before dispatching again.

With the inputs above, the workflow produces GitHub artifacts and does not upload to Google Play or TestFlight. It does not roll out an app publicly. `qa_signing_only=true` is a separate preview lane with weaker backend prerequisites; it must not be used to present an unverified production candidate as release-ready.

## Review the resulting artifacts

Select the new manual run by its exact branch and commit, then watch it with:

```powershell
gh run watch RUN_ID --repo Gatcheni2025/Business-lift
```

A successful all-platform signed run should expose these artifacts:

| GitHub artifact | Expected contents |
| --- | --- |
| `teyza-android-apk-signed` | `teyza-1.0.49-59-signed.apk` for direct-device testing with the existing upload key |
| `teyza-android-aab-signed` | `teyza-1.0.49-59-signed.aab`, signed APK, release manifest, hashes and signature evidence |
| `teyza-ios-release-signed` | Exported signed IPA, signed archive, release manifest and hashes |

Check each `release-manifest.json` for the reviewed source commit, **1.0.49+59**, `signing: signed`, `releasePurpose: production_candidate`, the correct application or bundle ID, and the recorded SHA-256 hashes. Android packaging verifies APK/AAB signer agreement and the APK's actual version and identity. The iOS packaging verifies the signed archive; also inspect the exported IPA's `Info.plist`, signature and hash before distribution. Check that both platform jobs completed and that the TestFlight upload step was skipped.

The manifests deliberately retain `storeSubmitted: false` and unverified device outcomes. Do not treat an artifact name, successful compile or backend capability flag as a real-device login, payment or store-publication result.

## Device verification and later store release

Use dedicated shopper and seller accounts. Verify cold launch for a guest and restored shopper/seller sessions; product browsing and basket building without login; checkout sign-in and cancellation without basket loss; account switching without another user's private state; the revised registration steps; seller online-order and online-payment preferences; and usable narrow-screen and enlarged-text layouts. The basket is retained within the current app session, not across a full app restart.

Verify actual Google/Apple sign-in, phone OTP, notifications, the payment browser return and authoritative order reconciliation on signed devices. Check declined or cancelled payment recovery as well as an eligible paid order. A controlled live payment needs a deliberately selected merchant and payer; source tests do not perform or authorize that charge. WhatsApp welcome delivery needs a delivered/read receipt for the intended recipient. No message is sent merely by building this candidate.

The Play upload key and Google Play app-signing key can differ. A directly installed upload-key APK may not replace a Play-installed or differently signed tester app. Verify the installed certificate and preserve local data before changing an installation. Firebase authentication fingerprints must match the certificate actually installed on the device.

After artifact and device review, upload the signed AAB to the separately selected Play testing track. A later explicit TestFlight upload is a separate action; verify its exact IPA version, build, commit and hash before using the existing upload workflow. Apple upload acceptance still requires processing and tester assignment checks. Neither a Play testing upload nor a TestFlight upload is a public production rollout. Public publication remains a separate release decision.

CI uses synthetic accounts and mocked provider responses. It does not establish real SMS, Google/Apple login, APNs/FCM delivery, merchant payouts, WhatsApp delivery, Apple processing or physical-device behavior. Record those outcomes from actual verification rather than changing the release evidence to imply they occurred.

