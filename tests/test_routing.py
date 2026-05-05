import unittest

from src.agents.capabilities import AgentDetection, DetectionState, TaskKind
from src.routing.router import RoutingError, RoutingRequest, classify_task, route_task


def available(*agent_ids: str) -> tuple[AgentDetection, ...]:
    return tuple(
        AgentDetection(
            agent_id=agent_id,
            display_name=agent_id,
            state=DetectionState.AVAILABLE,
            executable=f"/bin/{agent_id}",
        )
        for agent_id in agent_ids
    )


class RoutingTests(unittest.TestCase):
    def test_classifies_task_kinds(self) -> None:
        self.assertEqual(classify_task("fix regression in auth flow"), TaskKind.SECURITY)
        self.assertEqual(classify_task("optimize slow test runner"), TaskKind.PERFORMANCE)
        self.assertEqual(classify_task("fix broken parser"), TaskKind.BUG)
        self.assertEqual(classify_task("add feature for adapter docs"), TaskKind.FEATURE)
        self.assertEqual(classify_task("explain current status"), TaskKind.SIMPLE)

    def test_uses_claude_as_default_coordinator(self) -> None:
        decision = route_task(
            RoutingRequest(prompt="add feature for routing"),
            detections=available("claude-code", "codex-cli", "cursor-cli", "gemini-cli"),
        )

        self.assertEqual(decision.task_kind, TaskKind.FEATURE)
        self.assertEqual(decision.coordinator_id, "claude-code")
        self.assertEqual(decision.agent_ids[0], "claude-code")
        self.assertTrue(all(command.dry_run for command in decision.dry_run_commands))

    def test_enforces_write_policy_for_pr_and_atlassian(self) -> None:
        decision = route_task(
            RoutingRequest(
                prompt="prepare bug fix",
                requested_agent_ids=("claude-code", "cursor-cli", "codex-cli"),
                require_pr_write=True,
                require_atlassian_write=True,
            ),
            detections=available("claude-code", "cursor-cli", "codex-cli"),
        )

        self.assertEqual(decision.agent_ids, ("claude-code", "codex-cli"))

    def test_rejects_write_policy_when_no_allowed_agent_selected(self) -> None:
        with self.assertRaises(RoutingError):
            route_task(
                RoutingRequest(
                    prompt="prepare bug fix",
                    requested_agent_ids=("cursor-cli",),
                    require_pr_write=True,
                ),
                detections=available("cursor-cli"),
            )

    def test_enforces_max_agents(self) -> None:
        with self.assertRaises(RoutingError):
            route_task(
                RoutingRequest(prompt="optimize latency", max_agents=4),
                detections=available(
                    "claude-code",
                    "codex-cli",
                    "gemini-cli",
                    "opencode",
                    "cursor-cli",
                    "ollama-qwen",
                ),
            )

    def test_security_route_stays_with_security_capable_agents(self) -> None:
        decision = route_task(
            RoutingRequest(prompt="scan security vulnerability", task_kind=TaskKind.SECURITY),
            detections=available(
                "claude-code",
                "codex-cli",
                "github-copilot-cli",
                "gemini-cli",
                "opencode",
                "cursor-cli",
            ),
        )

        self.assertEqual(decision.agent_ids, ("claude-code", "codex-cli", "gemini-cli", "opencode"))
        self.assertLessEqual(len(decision.agent_ids), 5)


if __name__ == "__main__":
    unittest.main()
