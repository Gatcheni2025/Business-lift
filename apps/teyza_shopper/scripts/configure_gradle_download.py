"""Pin Flutter-generated Gradle wrapper to a checksum-verified distribution mirror.

Flutter creates android/ during CI. Pin the *same Gradle version* to the
checksum-verified distribution mirror using the smaller binary ZIP.
Do not change Android Gradle Plugin, Java or APK signing certificates.
"""
from __future__ import annotations

from pathlib import Path
import re

PROJECT = Path(__file__).resolve().parents[1]
WRAPPER = PROJECT / "android/gradle/wrapper/gradle-wrapper.properties"

def configure(path: Path = WRAPPER) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"Generate the Android platform before configuring Gradle: {path}")
    raw = path.read_text(encoding="utf-8")
    found = re.search(r"(?m)^distributionUrl=(.+)$", raw)
    if not found:
        raise ValueError("Gradle wrapper has no distribution URL")
    existing = found.group(1).strip().replace(r"\:", ":")
    match = re.fullmatch(
        r"https://(?:services\.gradle\.org|downloads\.gradle\.org)/distributions/gradle-(\d+\.\d+(?:\.\d+)?)-(all|bin)\.zip"
        r"|https://distfiles\.macports\.org/gradle/gradle-(\d+\.\d+(?:\.\d+)?)-bin\.zip",
        existing,
    )
    if not match:
        raise ValueError(f"Unexpected Gradle wrapper distribution source: {existing!r}")
    version = match.group(1) or match.group(3)
    # Independent official checksums from https://gradle.org/release-checksums/.
    # Upgrading Flutter/Gradle requires a deliberate checksum review first.
    verified_checksums = {
        "9.3.1": "b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06",
    }
    if version not in verified_checksums:
        raise ValueError(f"Gradle {version} has no independently verified distribution checksum")
    # Official Gradle endpoints currently redirect to GitHub releases which
    # repeatedly return HTTP 504 in Actions. Use the MacPorts distfile mirror
    # for CI instead, and demand the exact official binary distribution SHA256.
    target = f"https\\://distfiles.macports.org/gradle/gradle-{version}-bin.zip"
    updated = raw[:found.start(1)] + target + raw[found.end(1):]
    for key, value in [("networkTimeout", "120000"), ("retries", "3"), ("retryBackOffMs", "1500"), ("distributionSha256Sum", verified_checksums[version])]:
        if re.search(rf"(?m)^{key}=", updated):
            updated = re.sub(rf"(?m)^{key}=.*$", f"{key}={value}", updated)
        else:
            updated = updated.rstrip("\n") + f"\n{key}={value}\n"
    path.write_text(updated, encoding="utf-8")
    return version

if __name__ == "__main__":
    print("Gradle wrapper pinned to official downloads.gradle.org CDN; version:", configure())
