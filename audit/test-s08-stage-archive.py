#!/usr/bin/env python3
"""Tests S08 archive ZIP, hors ligne et sans Codespaces/Supabase."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name("s08-stage-archive.py")


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="s08-ziptest-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.archive = self.root / "s08-transfer.zip"

    def run_script(self):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.archive), "--verify-only"],
            env={**os.environ, "HOME": str(self.home)},
            capture_output=True, text=True, timeout=30
        )

    def fixture(self):
        snapshot = {
            "format": "atelier-test-full-garage-snapshot-v1",
            "accountId": "owner",
            "createdAt": "2026-11-23T00:00:00Z",
            "garages": [{"garage_id": "garage", "user_id": "owner", "data": {"workorders": []}}],
            "quotes": [],
            "operational": {"garage_timer_sessions": [], "garage_calendar_notes": [], "garage_schedule_events": []}
        }
        data = json.dumps(snapshot).encode()
        manifest = {
            "format": "atelier-test-physical-backup-v1", "source": "Supabase TEST",
            "bucket": "wo-files", "status": "INCOMPLETE",
            "missingTables": ["garage_timer_sessions", "garage_calendar_notes", "garage_schedule_events"],
            "failed": [], "unresolvedReferences": [],
            "accountId": "owner", "garageId": "garage", "memberIds": ["owner"],
            "createdAt": snapshot["createdAt"], "snapshotBytes": len(data),
            "snapshotSha256": hashlib.sha256(data).hexdigest(), "quoteCount": 0,
            "operationalCounts": {"garage_timer_sessions": 0, "garage_calendar_notes": 0, "garage_schedule_events": 0},
            "files": [], "fileCount": 0, "totalBytes": 0, "referencedPaths": 0,
            "ownedPathList": [], "ownedPaths": 0
        }
        return data, json.dumps(manifest).encode()

    def test_valid_nested_archive(self):
        data, manifest = self.fixture()
        with zipfile.ZipFile(self.archive, "w") as z:
            z.writestr("garage-s08-physical-fixture/manifest.json", manifest)
            z.writestr("garage-s08-physical-fixture/garage-data.json", data)
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("S08_ARCHIVE_OK", result.stdout)

    def test_zip_slip_rejected(self):
        data, manifest = self.fixture()
        with zipfile.ZipFile(self.archive, "w") as z:
            z.writestr("manifest.json", manifest)
            z.writestr("garage-data.json", data)
            z.writestr("../escape.txt", "malicious")
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.home / "escape.txt").exists())

    def test_tampered_json_rejected(self):
        data, manifest = self.fixture()
        with zipfile.ZipFile(self.archive, "w") as z:
            z.writestr("manifest.json", manifest)
            z.writestr("garage-data.json", data + b"x")
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("S08_REFUSED", result.stderr)


if __name__ == "__main__":
    unittest.main()
