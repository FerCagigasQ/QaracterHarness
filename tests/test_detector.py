from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from init.detector import detect_stack
from init.scanner import scan_repo

FIXTURES = Path(__file__).parent / "fixtures"


class DetectorTests(unittest.TestCase):
    def test_detects_python_pytest_project(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pyproject.toml").write_text('[project]\nname = "demo"\n[tool.pytest.ini_options]\n', encoding="utf-8")
            (root / "tests").mkdir()
            (root / "tests" / "test_demo.py").write_text("def test_demo():\n    assert True\n", encoding="utf-8")

            detection = detect_stack(scan_repo(root))

        self.assertIn("python", detection.languages)
        self.assertIn("python -m pytest", detection.test_commands)
        self.assertTrue(detection.tests_present)

    def test_detects_node_scripts_and_ci(self) -> None:
        detection = detect_stack(scan_repo(FIXTURES / "node-vite"))

        self.assertIn("javascript", detection.languages)
        self.assertIn("vite", detection.frameworks)
        self.assertIn("github-actions", detection.ci_providers)
        self.assertIn("npm run test", detection.test_commands)


if __name__ == "__main__":
    unittest.main()
