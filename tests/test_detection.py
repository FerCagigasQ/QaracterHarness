import unittest

from src.agents.adapters import default_adapters, get_adapter
from src.agents.capabilities import DetectionState
from src.agents.detection import detect_local_agents, detected_adapters
from src.agents.executor import DryRunExecutor, SubprocessRunExecutor


class DetectionTests(unittest.TestCase):
    def test_detects_available_executables_with_mock_resolver(self) -> None:
        paths = {
            "claude": "/usr/local/bin/claude",
            "gh": "/usr/bin/gh",
            "ollama": "/usr/bin/ollama",
        }

        detections = detect_local_agents(resolver=paths.get)
        by_id = {detection.agent_id: detection for detection in detections}

        self.assertEqual(by_id["claude-code"].state, DetectionState.AVAILABLE)
        self.assertEqual(by_id["github-copilot-cli"].executable, "/usr/bin/gh")
        self.assertEqual(by_id["ollama-qwen"].state, DetectionState.AVAILABLE)
        self.assertEqual(by_id["codex-cli"].state, DetectionState.MISSING)

    def test_filters_detected_adapters(self) -> None:
        paths = {"codex": "/opt/bin/codex"}

        adapters = detected_adapters(resolver=paths.get)

        self.assertEqual(tuple(adapter.agent_id for adapter in adapters), ("codex-cli",))

    def test_cursor_detection_accepts_fallback_candidate(self) -> None:
        paths = {"cursor": "/usr/bin/cursor"}

        detections = detect_local_agents(resolver=paths.get)
        by_id = {detection.agent_id: detection for detection in detections}

        self.assertEqual(by_id["cursor-cli"].state, DetectionState.AVAILABLE)
        self.assertEqual(by_id["cursor-cli"].executable, "/usr/bin/cursor")

    def test_command_construction_defaults_to_dry_run(self) -> None:
        adapter = get_adapter("ollama-qwen")

        command = adapter.build_command("Summarize diff")
        result = DryRunExecutor().execute(command)

        self.assertTrue(command.dry_run)
        self.assertFalse(command.dangerous)
        self.assertEqual(command.argv, ("ollama", "run", "qwen2.5-coder:latest", "Summarize diff"))
        self.assertFalse(result.executed)

    def test_subprocess_executor_rejects_dangerous_without_opt_in(self) -> None:
        command = get_adapter("claude-code").build_command("Fix issue", dry_run=False)

        with self.assertRaises(PermissionError):
            SubprocessRunExecutor().execute(command)


if __name__ == "__main__":
    unittest.main()
