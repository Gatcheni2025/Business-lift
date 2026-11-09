"""Read-only regression checks for the separate signed QA lane."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class SignedQaWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (ROOT / ".github/workflows/teyza-mobile-release.yml").read_text()
        cls.plan = (ROOT / "apps/teyza_shopper/lib/seller_plan.dart").read_text()
        cls.package = (ROOT / "apps/teyza_shopper/scripts/package_mobile_release.py").read_text()

    def test_qa_is_explicit_manual_opt_in_and_production_gate_is_preserved(self):
        self.assertIn("qa_signing_only:", self.workflow)
        self.assertIn("default: false", self.workflow)
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.qa_signing_only == true", self.workflow)
        self.assertIn("if: env.SIGNING_MODE == 'signed' && inputs.qa_signing_only != true", self.workflow)
        self.assertIn("required_exact={'version':'3.25.0'", self.workflow)
        self.assertIn("automaticProductPublication", self.workflow)
        self.assertIn("adminComplimentaryAccess", self.workflow)
        self.assertIn("'agentCommissionEnabled'", self.workflow)

    def test_store_artifacts_keep_store_channel_and_direct_apk_is_only_separate_manual_qa(self):
        store_builds, direct_builds = [], []
        for line in self.workflow.splitlines():
            if "flutter build " in line and any(x in line for x in
                    ("flutter build appbundle", "flutter build apk", "flutter build ipa")):
                if "--dart-define=TEYZA_PAYMENT_CHANNEL=direct" in line:
                    self.assertIn("flutter build apk", line)
                    direct_builds.append(line)
                else:
                    self.assertIn("--dart-define=TEYZA_PAYMENT_CHANNEL=store", line)
                    store_builds.append(line)
        self.assertEqual(len(direct_builds), 2)  # signed manual QA + debug-only manual QA
        self.assertGreaterEqual(len(store_builds), 4)
        self.assertIn("direct_mandate_qa:", self.workflow)
        self.assertIn("if [ \"$TEYZA_DIRECT_MANDATE_QA\" = true ]; then", self.workflow)
        self.assertIn("QA_SIGNING_ONLY\" != true", self.workflow)
        self.assertIn("TARGET_PLATFORMS\" != android", self.workflow)
        self.assertIn("teyza-android-apk-direct-mandate-qa-signed", self.workflow)
        self.assertIn("scripts/package_teyza_direct_mandate_qa.py", self.workflow)
        self.assertIn("direct_mandate_debug_qa:", self.workflow)
        self.assertIn("TEYZA_DIRECT_MANDATE_DEBUG_QA", self.workflow)
        self.assertIn("if [ \"$TEYZA_DIRECT_MANDATE_DEBUG_QA\" = true ]; then", self.workflow)
        self.assertIn('"$SIGNING_MODE" != unsigned', self.workflow)
        self.assertIn('"$TARGET_PLATFORMS" != android', self.workflow)
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.direct_mandate_debug_qa == true", self.workflow)
        self.assertIn("teyza-android-apk-direct-mandate-debug-qa", self.workflow)
        self.assertIn("defaultValue:'store'", self.plan)
        # The channel flags and QA signing lanes still exist, but NONE of
        # the mobile distributions may initiate an external digital-membership
        # payment. The historical test expected Android direct checkout and
        # must now actively reject that unsafe behaviour.
        self.assertIn("bool teyzaCanOpenMembershipPage({required bool isAndroid,required String channel})=>false;", self.plan)
        self.assertIn("No payments or subscriptions can be initiated in this app.", self.plan)
        self.assertNotIn("teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel)", self.plan)
        self.assertNotIn("isAndroid&&channel=='direct'", self.plan)
        self.assertNotIn("billing_checkout", self.plan)
        self.assertNotIn("https://teyza.co.za/pay", self.plan)

    def test_direct_apk_signing_is_reverified_and_cannot_be_the_play_bundle(self):
        direct_package = (ROOT / "scripts/package_teyza_direct_mandate_qa.py").read_text()
        self.assertIn("validate(", direct_package)
        self.assertIn("certificateSha256", direct_package)
        self.assertIn("storeUploadPermitted", direct_package)
        self.assertIn("TEYZA_DIRECT_MANDATE_QA", direct_package)
        self.assertIn("README-DIRECT-MANDATE-QA-ONLY.txt", direct_package)
        self.assertIn("collectionProviderConnected", direct_package)

    def test_qa_artifacts_are_distinct_and_manifest_is_truthful(self):
        for marker in ("teyza-android-apk-", "teyza-android-aab-", "teyza-ios-release-"):
            self.assertIn(marker + "${{ inputs.qa_signing_only && 'qa-signed'", self.workflow)
        self.assertIn("'releasePurpose': 'qa_preview_only'", self.package)
        self.assertIn("'inAppDigitalSubscriptionPurchasesEnabled': False", self.package)
        self.assertIn("'productionFirebaseAccountsAndData': True", self.package)
        self.assertIn("README-QA-ONLY.txt", self.package)

if __name__ == "__main__":
    unittest.main()


