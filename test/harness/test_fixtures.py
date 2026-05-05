from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

from cli_harness import FIXTURES_ROOT


class FixtureTests(unittest.TestCase):
    def read_json(self, relative_path: str) -> dict:
        return json.loads((FIXTURES_ROOT / relative_path).read_text(encoding="utf8"))

    def test_minimal_project_defaults_match_mvp_policy(self) -> None:
        config = self.read_json("minimal-project/apolo.config.json")
        defaults = config["defaults"]

        self.assertEqual(defaults["coordinator"], "claude")
        self.assertEqual(defaults["localModel"]["provider"], "ollama")
        self.assertEqual(defaults["localModel"]["model"], "qwen")
        self.assertLessEqual(defaults["maxAgents"], 5)
        self.assertEqual(defaults["humanApproval"], "always")
        self.assertLessEqual(len(config["agents"]), 5)
        self.assertTrue(all(agent["requiresApproval"] for agent in config["agents"]))

    def test_agent_fixture_enforces_limit(self) -> None:
        fixture = self.read_json("agents/agents.json")

        self.assertLessEqual(len(fixture["agents"]), fixture["limits"]["maxAgents"])
        self.assertLessEqual(fixture["limits"]["maxAgents"], 5)
        self.assertTrue(all(agent["requiresApproval"] for agent in fixture["agents"]))

    def test_plan_fixture_requires_approval_before_run(self) -> None:
        plan = self.read_json("plans/basic-plan.json")

        self.assertTrue(plan["approvalRequired"])
        self.assertFalse(plan["approved"])
        self.assertLessEqual(plan["maxParallelAgents"], 5)

    def test_jsonl_memory_fixture_is_parseable(self) -> None:
        memory_path = FIXTURES_ROOT / "memory" / "seed-memory.jsonl"
        entries = [
            json.loads(line)
            for line in memory_path.read_text(encoding="utf8").splitlines()
            if line.strip()
        ]

        self.assertGreaterEqual(len(entries), 1)
        self.assertTrue(all(entry["source"] == "fixture" for entry in entries))

    def test_all_json_fixtures_are_valid(self) -> None:
        for path in Path(FIXTURES_ROOT).rglob("*.json"):
            with self.subTest(path=path):
                json.loads(path.read_text(encoding="utf8"))

    def test_e2e_node_repo_fixture_has_verification_scripts(self) -> None:
        package = self.read_json("e2e/node-repo/package.json")

        self.assertEqual(package["name"], "apolo-e2e-node-repo")
        self.assertEqual(
            tuple(package["scripts"]),
            ("lint", "typecheck", "build", "test"),
        )
        self.assertFalse((FIXTURES_ROOT / "e2e" / "node-repo" / "requirements.txt").exists())

    def test_e2e_python_target_fixture_is_target_only(self) -> None:
        fixture = FIXTURES_ROOT / "e2e" / "python-target-repo"

        self.assertTrue((fixture / "pyproject.toml").exists())
        self.assertTrue((fixture / "tests" / "test_sample.py").exists())
        self.assertFalse((fixture / "package.json").exists())

    def test_e2e_repo_without_tests_detects_no_test_files(self) -> None:
        fixture = FIXTURES_ROOT / "e2e" / "repo-without-tests"

        self.assertTrue((fixture / "README.md").exists())
        self.assertFalse((fixture / "tests").exists())
        self.assertFalse((fixture / "package.json").exists())
        self.assertFalse((fixture / "pyproject.toml").exists())

    def test_e2e_simulated_secret_fixture_uses_dummy_marker(self) -> None:
        content = (FIXTURES_ROOT / "e2e" / "repo-with-secret" / "sample.txt").read_text(
            encoding="utf8"
        )

        self.assertIn("FAKE_SECRET_FOR_APOLO_TESTS_ONLY", content)
        self.assertNotRegex(content, r"(?i)\b(?:sk|ghp|glpat|xoxb|AKIA)[A-Za-z0-9_=-]{12,}")

    def test_e2e_agent_fake_bins_are_executable(self) -> None:
        fixture = FIXTURES_ROOT / "e2e" / "agent-fake-bins"
        manifest = self.read_json("e2e/agent-fake-bins/agents.json")

        for agent in manifest["agents"]:
            with self.subTest(agent=agent["name"]):
                command = fixture / manifest["fakeBinDirectory"] / agent["command"]
                self.assertTrue(command.exists())
                completed = subprocess.run(
                    [str(command)],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertEqual(completed.stdout.strip(), agent["expectedOutput"])
