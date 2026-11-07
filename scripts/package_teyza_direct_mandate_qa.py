"""Package a separately-labelled, signed Android DIRECT QA mandate APK.

Never publish this APK or any bundle built with TEYZA_PAYMENT_CHANNEL=direct
on Google Play. The store AAB and APK are separately compiled with store mode.
Only the existing upload key can sign this artifact.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess

from package_teyza_store_apk import ROOT, validate


def main():
    release = ROOT / "build/release"
    manifest = json.loads((release / "release-manifest.json").read_text())
    store = manifest.get("androidStoreVerification")
    if manifest.get("signing") != "signed" or not store:
        raise SystemExit("Direct mandate QA requires the signed verified store bundle and APK first.")
    if os.environ.get("TEYZA_DIRECT_MANDATE_QA") != "true" or os.environ.get("QA_SIGNING_ONLY") != "true":
        raise SystemExit("Only explicit direct-mandate manual QA runs may package this APK.")
    sdk = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
    variants = [p for p in (sdk / "build-tools").iterdir()
                if (p / "apksigner").is_file() and (p / "aapt").is_file() and (p / "zipalign").is_file()]
    if not variants:
        raise SystemExit("Android SDK signing verification tools were not found.")
    tools = max(variants, key=lambda p: tuple(int(n) for n in re.findall(r"\d+", p.name)))
    apk = ROOT / "build/app/outputs/flutter-apk/app-release.apk"
    bundle = next(release.glob("*-signed.aab"), None)
    if not apk.is_file() or bundle is None:
        raise SystemExit("Missing signed APK or release bundle.")

    def run(args):
        return subprocess.check_output([str(v) for v in args], text=True, stderr=subprocess.STDOUT)

    signature = run([tools / "apksigner", "verify", "--verbose", "--print-certs", apk])
    details = validate(run([tools / "aapt", "dump", "badging", apk]),
                       signature, run(["keytool", "-printcert", "-rfc", "-jarfile", bundle]),
                       manifest["version"])
    if (details["certificateSha256"] != store.get("certificateSha256") or
            details["versionCode"] != store.get("versionCode") or
            details["applicationId"] != store.get("applicationId")):
        raise SystemExit("Direct QA APK identity/certificate differs from the Play-signed build.")
    run([tools / "zipalign", "-c", "-P", "16", "4", apk])
    dest = ROOT / "build/direct-mandate-qa"
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / ("teyza-" + manifest["version"].replace("+", "-")
                     + "-android-direct-mandate-QA-signed.apk")
    shutil.copy2(apk, target)
    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    (dest / "README-DIRECT-MANDATE-QA-ONLY.txt").write_text(
        "TEYZA ANDROID DIRECT-DISTRIBUTION MANDATE TEST BUILD\n\n"
        "DO NOT UPLOAD THIS APK TO GOOGLE PLAY OR DISTRIBUTE IT AS A STORE BUILD.\n"
        "The Play AAB in the separate artifact uses TEYZA_PAYMENT_CHANNEL=store.\n"
        "This optional APK was built with TEYZA_PAYMENT_CHANNEL=direct, enabling\n"
        "the R99 debit-order mandate for approved sellers outside the app stores.\n"
        "It uses the original release upload certificate, not a regenerated key.\n"
        "CAUTION: this APK still connects to the existing Firebase project; use\n"
        "dedicated test seller accounts and do not enter real banking information\n"
        "during QA unless the privacy and provider-collection process is approved.\n"
        "A mandate submission never triggers a debit or grants paid membership.\n"
        "Source commit: " + os.environ.get("GITHUB_SHA", "unavailable") + "\n"
        "APK SHA-256: " + sha + "\n"
    )
    (dest / "direct-mandate-qa-manifest.json").write_text(json.dumps({
        "purpose": "direct_android_qa_only",
        "storeUploadPermitted": False,
        "paymentChannel": "direct",
        "storeAabPaymentChannel": "store",
        "existingFirebaseProject": True,
        "paidMembershipUnlockedByMandate": False,
        "collectionProviderConnected": False,
        "applicationId": details["applicationId"],
        "versionName": details["versionName"],
        "versionCode": details["versionCode"],
        "certificateSha256": details["certificateSha256"],
        "file": target.name,
        "sha256": sha
    }, indent=2) + "\n")
    print("Direct-only signed QA APK verified against the store certificate:", target.name)


if __name__ == "__main__":
    main()
