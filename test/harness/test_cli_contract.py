from __future__ import annotations

import json
import unittest

from cli_harness import FixtureWorkspace, apolo_bin, run_apolo


@unittest.skipUnless(apolo_bin(), "APOLO_BIN is not set")
class CliContractTests(unittest.TestCase):
    def test_doctor_dry_run_reports_policy(self) -> None:
        with FixtureWorkspace() as workspace:
            result = run_apolo(["doctor", "--dry-run"], workspace.path)

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["command"], "doctor")
        self.assertEqual(payload["approval"], "always")
        self.assertEqual(payload["maxAgents"], 5)

    def test_agents_help_is_available(self) -> None:
        with FixtureWorkspace() as workspace:
            result = run_apolo(["agents", "--help"], workspace.path)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("apolo agents", result.stdout)
