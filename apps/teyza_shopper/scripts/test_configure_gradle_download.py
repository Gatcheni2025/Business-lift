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

    def test_gradle_9_5_0_uses_independently_verified_official_binary_checksum(self):
        # Checksum published by Gradle at https://gradle.org/release-checksums/
        # The generated Flutter wrapper must keep its 9.5.0 version.
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"gradle-wrapper.properties"
            path.write_text("distributionUrl=https\\://services.gradle.org/distributions/gradle-9.5.0-all.zip\n")
            self.assertEqual(module.configure(path),"9.5.0")
            updated=path.read_text()
            self.assertIn("distributionUrl=https\\://distfiles.macports.org/gradle/gradle-9.5.0-bin.zip", updated)
            self.assertIn("distributionSha256Sum=553c78f50dafcd54d65b9a444649057857469edf836431389695608536d6b746", updated)
            module.configure(path)
            self.assertEqual(updated,path.read_text(),"Reconfiguration must be idempotent")

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

    def test_kotlin_mirror_includes_project_level_compiler_classpaths(self):
        # Kotlin's compiler is loaded by :camera_android_camerax's
        # kotlinBuildToolsApiClasspath (a PROJECT repository configuration).
        # A settings-only init hook still downloads from the broken redirect.
        init_script=Path(__file__).with_name("ci-kotlin-mirror.init.gradle").read_text()
        self.assertIn("gradle.beforeProject",init_script)
        self.assertIn("if (project.name == 'camera_android_camerax')",init_script,
            "Flutter included builds enforce settings-only repositories")
        self.assertIn("teyzaCIKotlinCompilerProjectMirror",init_script)
        self.assertIn("includeGroup('org.jetbrains.kotlin')",init_script)
        self.assertIn("maven.aliyun.com/repository/central",init_script)
        self.assertIn("mavenCentral()",init_script)

    def test_does_not_create_a_missing_native_project(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                module.configure(Path(folder)/"missing.properties")

if __name__=="__main__":
    unittest.main()
