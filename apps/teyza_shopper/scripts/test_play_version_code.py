"""Guard against reusing a Google Play version code already visible in Console.

Existing Teyza Play bundle in release history: 1.0.37 (48).
The signed 1.0.38 (49) candidate was already generated; do not reuse it.
Every subsequent uploaded bundle must use a strictly greater, never-before-used
version code. This floor is deliberately conservative: Play Console remains
the authoritative source if a newer code is uploaded independently.
"""
from pathlib import Path
import re
import unittest

PUBSPEC = Path(__file__).resolve().parents[1] / "pubspec.yaml"
PREVIOUS_PLAY_CODE = 49

def parse_version(source):
    matches = re.findall(r"(?m)^version:\s*(\d+)\.(\d+)\.(\d+)\+(\d+)\s*$", source)
    if len(matches) != 1:
        raise ValueError("Expected one semantic version with a numeric Flutter build code")
    major, minor, patch, code = map(int, matches[0])
    return (major, minor, patch), code

class PlayVersionCodeTests(unittest.TestCase):
    def test_next_android_upload_uses_code_higher_than_play_console(self):
        version, code = parse_version(PUBSPEC.read_text(encoding="utf8"))
        self.assertGreater(code, PREVIOUS_PLAY_CODE)
        self.assertGreaterEqual(version, (1, 0, 39))

    def test_old_code_is_rejected(self):
        _, code = parse_version("version: 1.0.35+46")
        self.assertLessEqual(code, PREVIOUS_PLAY_CODE)

    def test_version_metadata_required(self):
        with self.assertRaises(ValueError):
            parse_version("version: 1.0.38")

if __name__ == "__main__":
    unittest.main()
