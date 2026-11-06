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

    def test_signed_builds_compile_only_store_payment_channel(self):
        for line in self.workflow.splitlines():
            if "flutter build " in line and any(x in line for x in
                    ("flutter build appbundle", "flutter build apk", "flutter build ipa")):
                self.assertIn("--dart-define=TEYZA_PAYMENT_CHANNEL=store", line)
        self.assertIn("defaultValue:'store'", self.plan)
        self.assertIn("teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel)", self.plan)
        self.assertIn("isAndroid&&channel=='direct'", self.plan)

    def test_qa_artifacts_are_distinct_and_manifest_is_truthful(self):
        for marker in ("teyza-android-apk-", "teyza-android-aab-", "teyza-ios-release-"):
            self.assertIn(marker + "${{ inputs.qa_signing_only && 'qa-signed'", self.workflow)
        self.assertIn("'releasePurpose': 'qa_preview_only'", self.package)
        self.assertIn("'inAppDigitalSubscriptionPurchasesEnabled': False", self.package)
        self.assertIn("'productionFirebaseAccountsAndData': True", self.package)
        self.assertIn("README-QA-ONLY.txt", self.package)

if __name__ == "__main__":
    unittest.main()


