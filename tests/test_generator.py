from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from init.detector import detect_stack
from init.generator import build_harness_plan
from init.handoff import build_handoff_summary
from init.pr_hooks import build_pull_request_handoff
from init.scanner import scan_repo
from init.writer import apply_write_plan, summarize_write_plan

FIXTURES = Path(__file__).parent / "fixtures"


class GeneratorTests(unittest.TestCase):
    def test_generates_required_files_and_minimal_python_test(self) -> None:
        root = FIXTURES / "python-empty"
        scan = scan_repo(root)
        detection = detect_stack(scan)
        plan = build_harness_plan(scan, detection, build_handoff_summary(root, detection))

        paths = {file.relative_path for file in plan.files}

        self.assertIn("AGENTS.md", paths)
        self.assertIn("CLAUDE.md", paths)
        self.assertIn("apolo.yaml", paths)
        self.assertIn(".apolo/manifest.json", paths)
        self.assertIn(".apolo/project-profile.json", paths)
        self.assertIn(".apolo/gates.yaml", paths)
        self.assertIn("apolo-memory/README.md", paths)
        self.assertIn("tests/test_apolo_smoke.py", paths)
        self.assertIn("python -m unittest discover", detection.test_commands)

    def test_safe_writer_blocks_unmanaged_conflicts(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "AGENTS.md").write_text("custom instructions\n", encoding="utf-8")
            scan = scan_repo(root)
            detection = detect_stack(scan)
            plan = build_harness_plan(scan, detection, build_handoff_summary(root, detection))

            summary = apply_write_plan(plan)

        self.assertIn("AGENTS.md", summary.conflicts)
        self.assertFalse((root / "apolo.yaml").exists())

    def test_dry_run_reports_creates(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scan = scan_repo(root)
            detection = detect_stack(scan)
            plan = build_harness_plan(scan, detection, build_handoff_summary(root, detection))
            summary = summarize_write_plan(plan)

        self.assertIn("apolo.yaml", summary.creates)
        self.assertIn("--- a/apolo.yaml", summary.diff)

    def test_pr_handoff_is_ready_without_conflicts(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            scan = scan_repo(root)
            detection = detect_stack(scan)
            plan = build_harness_plan(scan, detection, build_handoff_summary(root, detection))
            summary = summarize_write_plan(plan)

            handoff = build_pull_request_handoff(detection, summary)

        self.assertTrue(handoff.ready)
        self.assertEqual(handoff.title, "Initialize APOLO repository harness")
        self.assertIn("AGENTS.md", handoff.body)


if __name__ == "__main__":
    unittest.main()
