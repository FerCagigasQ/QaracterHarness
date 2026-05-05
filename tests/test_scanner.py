from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from init.scanner import scan_repo


class ScannerTests(unittest.TestCase):
    def test_scan_ignores_dependency_and_git_directories(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "package.json").write_text("{}", encoding="utf-8")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "ignored.js").write_text("", encoding="utf-8")
            (root / ".git").mkdir()
            (root / ".git" / "config").write_text("", encoding="utf-8")

            scan = scan_repo(root)

        paths = {path.as_posix() for path in scan.files}
        self.assertEqual(paths, {"package.json"})


if __name__ == "__main__":
    unittest.main()
