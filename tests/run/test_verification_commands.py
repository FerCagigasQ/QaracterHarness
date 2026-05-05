from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from verification.commands import DetectedCommand, VerificationCommandDetector


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


if __name__ == "__main__":
    unittest.main()
