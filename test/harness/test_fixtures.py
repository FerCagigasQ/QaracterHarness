from __future__ import annotations

import json
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
