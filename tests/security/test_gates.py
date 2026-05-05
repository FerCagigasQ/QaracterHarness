import unittest

from src.policy.config import PolicyConfig, SecretsPolicy
from src.security.gates import (
    ApprovalContext,
    BudgetUsage,
    DiffStats,
    FileWrite,
    MemoryWrite,
    PlanRequest,
    SecurityGateEngine,
    ToolCall,
)


class SecurityGateEngineTest(unittest.TestCase):
    def test_requires_human_approval_before_run(self) -> None:
        decisions = SecurityGateEngine().evaluate(PlanRequest(actor="claude"))

        self.assertTrue(_has_block(decisions, "human_approval"))

    def test_blocks_secret_like_content_when_placeholder_bypass_disabled(self) -> None:
        config = PolicyConfig(secrets=SecretsPolicy(allow_dummy_placeholders=False))
        request = PlanRequest(
            actor="claude",
            file_writes=(
                FileWrite(path="src/example.py", content="api_key=DUMMY_SECRET_VALUE"),
            ),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine(config).evaluate(request)

        self.assertTrue(_has_block(decisions, "secrets"))

    def test_destructive_command_requires_explicit_approval(self) -> None:
        request = PlanRequest(
            actor="claude",
            commands=("git reset --hard HEAD",),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "destructive_ops"))

    def test_destructive_command_can_continue_when_approved(self) -> None:
        request = PlanRequest(
            actor="claude",
            commands=("git reset --hard HEAD",),
            approvals=ApprovalContext(
                human_run_approved=True,
                destructive_ops_approved=True,
            ),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_allow(decisions, "destructive_ops"))

    def test_blocks_unlisted_tool_without_policy_approval(self) -> None:
        request = PlanRequest(
            actor="claude",
            tools=(ToolCall(name="network_shell"),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "tool_allowlist"))

    def test_blocks_unauthorized_writes_outside_scope(self) -> None:
        request = PlanRequest(
            actor="claude",
            file_writes=(FileWrite(path="../outside.txt", content="safe text"),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "write_scope"))

    def test_blocks_memory_write_over_limit(self) -> None:
        request = PlanRequest(
            actor="claude",
            memory_writes=(MemoryWrite(key="large-note", value="x" * 4001),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "memory_write"))

    def test_blocks_over_budget_runs(self) -> None:
        request = PlanRequest(
            actor="claude",
            budget=BudgetUsage(tool_calls=101),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "budget"))

    def test_blocks_risky_diff_size_without_approval(self) -> None:
        request = PlanRequest(
            actor="claude",
            diff=DiffStats(files_changed=21),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "diff_size"))

    def test_blocks_pr_writes_from_unapproved_actor(self) -> None:
        request = PlanRequest(
            actor="generic-agent",
            tools=(ToolCall(name="create_pr"),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "pr_permission"))

    def test_blocks_atlassian_writes_from_unapproved_actor(self) -> None:
        request = PlanRequest(
            actor="generic-agent",
            tools=(ToolCall(name="atlassian_write"),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        decisions = SecurityGateEngine().evaluate(request)

        self.assertTrue(_has_block(decisions, "atlassian_write_permission"))

    def test_allows_low_risk_approved_request(self) -> None:
        request = PlanRequest(
            actor="codex",
            tools=(ToolCall(name="read_file"),),
            file_writes=(FileWrite(path="src/security/example.py", content="safe text"),),
            approvals=ApprovalContext(human_run_approved=True),
        )

        self.assertTrue(SecurityGateEngine().is_allowed(request))


def _has_block(decisions: list, gate: str) -> bool:
    return any(decision.gate == gate and not decision.allowed for decision in decisions)


def _has_allow(decisions: list, gate: str) -> bool:
    return any(decision.gate == gate and decision.allowed for decision in decisions)
