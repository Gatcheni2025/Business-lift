"""Redirect Flutter-generated Gradle wrapper away from GitHub Release 504s.

Flutter creates android/ during CI. Pin the *same Gradle version* to the
official Gradle distribution CDN using the smaller binary distribution.
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
        r"https://(?:services\.gradle\.org|downloads\.gradle\.org)/distributions/gradle-(\d+\.\d+(?:\.\d+)?)-(all|bin)\.zip",
        existing,
    )
    if not match:
        raise ValueError(f"Unexpected Gradle wrapper distribution source: {existing!r}")
    version = match.group(1)
    # Official Gradle CDN: no GitHub Release asset redirect, unlike the
    # generated Gradle 'all' distribution URL on some Flutter versions.
    target = f"https\\://downloads.gradle.org/distributions/gradle-{version}-bin.zip"
    updated = raw[:found.start(1)] + target + raw[found.end(1):]
    for key, value in [("networkTimeout", "120000"), ("retries", "3"), ("retryBackOffMs", "1500")]:
        if re.search(rf"(?m)^{key}=", updated):
            updated = re.sub(rf"(?m)^{key}=.*$", f"{key}={value}", updated)
        else:
            updated = updated.rstrip("\n") + f"\n{key}={value}\n"
    path.write_text(updated, encoding="utf-8")
    return version

if __name__ == "__main__":
    print("Gradle wrapper pinned to official downloads.gradle.org CDN; version:", configure())
