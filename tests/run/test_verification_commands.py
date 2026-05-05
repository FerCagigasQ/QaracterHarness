from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from verification.commands import CommandRunner, DetectedCommand, VerificationCommandDetector


class StaticDetector:
    def __init__(self, commands: tuple[DetectedCommand, ...]) -> None:
        self.commands = commands

    def detect(self, repository: Path) -> tuple[DetectedCommand, ...]:
        return self.commands


class VerificationCommandDetectorTest(unittest.TestCase):
    def test_detects_node_scripts_in_priority_order(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            repository = Path(tempdir)
            (repository / "package.json").write_text(
                json.dumps(
                    {
                        "scripts": {
                            "test": "vitest",
                            "build": "vite build",
                            "lint": "eslint .",
                            "typecheck": "tsc --noEmit",
                        }
                    }
                ),
                encoding="utf-8",
            )

            commands = VerificationCommandDetector().detect(repository)

            self.assertEqual(
                commands,
                (
                    DetectedCommand("npm-lint", ("npm", "run", "lint")),
                    DetectedCommand("npm-typecheck", ("npm", "run", "typecheck")),
                    DetectedCommand("npm-build", ("npm", "run", "build")),
                    DetectedCommand("npm-test", ("npm", "run", "test")),
                ),
            )

    def test_detects_python_unittest_for_test_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            repository = Path(tempdir)
            (repository / "tests").mkdir()

            commands = VerificationCommandDetector().detect(repository)

            self.assertIn(
                DetectedCommand("python-tests", ("python", "-m", "unittest", "discover", "-s", "tests")),
                commands,
            )

    def test_runner_reports_timeout_and_continues_remaining_commands(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            commands = (
                DetectedCommand("slow", (sys.executable, "-c", "import time; time.sleep(1)")),
                DetectedCommand("fast", (sys.executable, "-c", "print('ok')")),
            )

            results = CommandRunner(detector=StaticDetector(commands), timeout_seconds=0.1).run(Path(tempdir))

            self.assertEqual(len(results), 2)
            self.assertEqual(results[0].name, "slow")
            self.assertEqual(results[0].exit_code, -1)
            self.assertFalse(results[0].passed)
            self.assertIn("timed out", results[0].stderr)
            self.assertEqual(results[1].name, "fast")
            self.assertTrue(results[1].passed)


if __name__ == "__main__":
    unittest.main()
