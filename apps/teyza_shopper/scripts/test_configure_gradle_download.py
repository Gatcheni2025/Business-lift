"""Offline checks for generated Gradle wrapper resilience in signed QA CI."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

module_path=Path(__file__).with_name("configure_gradle_download.py")
spec=importlib.util.spec_from_file_location("gradle_download",module_path)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class GradleDownloadTests(unittest.TestCase):
    def test_replaces_only_official_gradle_url_and_keeps_version(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"gradle-wrapper.properties"
            path.write_text("distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-all.zip\nnetworkTimeout=10000\n")
            self.assertEqual(module.configure(path),"9.3.1")
            text=path.read_text()
            self.assertIn("distributionUrl=https\\://distfiles.macports.org/gradle/gradle-9.3.1-bin.zip",text)
            self.assertIn("distributionSha256Sum=b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06",text)
            self.assertIn("networkTimeout=120000",text)
            self.assertIn("retries=3",text)
            self.assertIn("retryBackOffMs=1500",text)
            module.configure(path)
            self.assertEqual(path.read_text(),text,"rewriting wrapper must be idempotent")

    def test_rejects_unknown_host_without_changing_wrapper(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"gradle-wrapper.properties"
            original="distributionUrl=https\\://my-gradle-mirror.example/distributions/gradle-9.3.1-all.zip\n"
            path.write_text(original)
            with self.assertRaises(ValueError):
                module.configure(path)
            self.assertEqual(path.read_text(),original)


    def test_unknown_gradle_version_fails_closed_without_changing_wrapper(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"gradle-wrapper.properties"
            original="distributionUrl=https\\://services.gradle.org/distributions/gradle-99.0.0-bin.zip\n"
            path.write_text(original)
            with self.assertRaisesRegex(ValueError,"no independently verified"):
                module.configure(path)
            self.assertEqual(path.read_text(),original)

    def test_does_not_create_a_missing_native_project(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                module.configure(Path(folder)/"missing.properties")

if __name__=="__main__":
    unittest.main()
