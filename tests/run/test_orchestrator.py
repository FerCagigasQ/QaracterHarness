from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from git.pr import PrProvider, PrWorkflow
from run.approval import StaticApprovalGateway
from run.ledger import RunLedger
from run.orchestrator import RunOrchestrator
from run.routing import LogicalAgentRouter
from run.types import (
    ApprovalDecision,
    ApprovalStatus,
    ApprovedPlan,
    ExecutionMode,
    RunRequest,
    RunState,
    VerificationResult,
)


class InMemoryPlanStore:
    def __init__(self, plan: ApprovedPlan) -> None:
        self.plan = plan

    def load_approved_plan(self, plan_id: str) -> ApprovedPlan:
        if plan_id != self.plan.plan_id:
            raise ValueError("Unknown plan")
        return self.plan


class RecordingMemoryStore:
    def __init__(self) -> None:
        self.calls = 0

    def record_run(self, request: RunRequest, result) -> None:
        self.calls += 1


class StaticVerificationRunner:
    def run(self, repository: Path):
        return (
            VerificationResult(
                name="unit-tests",
                command=("python", "-m", "unittest"),
                exit_code=0,
                stdout="ok",
            ),
        )


class RunOrchestratorTest(unittest.TestCase):
    def test_pauses_before_execution_when_human_approval_is_pending(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            plan = ApprovedPlan(
                plan_id="APOLO-CLI-07",
                title="Run executor",
                objective="Exercise run workflow",
                tasks=("route", "verify"),
                approved=True,
            )
            ledger = RunLedger(Path(tempdir) / "ledger.jsonl")
            memory = RecordingMemoryStore()
            orchestrator = RunOrchestrator(
                plan_store=InMemoryPlanStore(plan),
                git_workflow=PrWorkflow(PrProvider.CLAUDE),
                ledger=ledger,
                memory_store=memory,
            )

            result = orchestrator.run(
                RunRequest(
                    plan_id=plan.plan_id,
                    repository=Path(tempdir),
                    objective=plan.objective,
                    mode=ExecutionMode.EXECUTE,
                )
            )

            self.assertEqual(result.state, RunState.APPROVAL_REQUIRED)
            self.assertEqual(result.approval.status, ApprovalStatus.PENDING)
            self.assertEqual(len(result.assignments), 2)
            self.assertEqual(result.execution_results, ())
            self.assertEqual(memory.calls, 0)
            event_types = [json.loads(line)["event_type"] for line in ledger.path.read_text().splitlines()]
            self.assertIn("approval.requested", event_types)
            self.assertNotIn("execution.completed", event_types)

    def test_approved_dry_run_routes_verifies_updates_memory_and_prepares_pr_draft(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            plan = ApprovedPlan(
                plan_id="APOLO-CLI-07",
                title="Run executor",
                objective="Exercise run workflow",
                tasks=("route", "delegate", "verify"),
                approved=True,
            )
            ledger = RunLedger(Path(tempdir) / "ledger.jsonl")
            memory = RecordingMemoryStore()
            orchestrator = RunOrchestrator(
                plan_store=InMemoryPlanStore(plan),
                git_workflow=PrWorkflow(PrProvider.CODEX),
                ledger=ledger,
                approval_gateway=StaticApprovalGateway(
                    ApprovalDecision(status=ApprovalStatus.APPROVED, approver="human")
                ),
                verification_runner=StaticVerificationRunner(),
                memory_store=memory,
            )

            result = orchestrator.run(
                RunRequest(
                    plan_id=plan.plan_id,
                    repository=Path(tempdir),
                    objective=plan.objective,
                    mode=ExecutionMode.DRY_RUN,
                    requested_agents=5,
                    branch_name="apolo/run-pr",
                )
            )

            self.assertEqual(result.state, RunState.COMPLETED)
            self.assertEqual(len(result.assignments), 5)
            self.assertTrue(all(item.status == "skipped" for item in result.execution_results))
            self.assertEqual(len(result.verification_results), 1)
            self.assertEqual(memory.calls, 1)
            self.assertEqual(result.pr_draft.provider, "codex")
            self.assertEqual(result.pr_draft.branch_name, "apolo/run-pr")
            self.assertIn("PASS", result.pr_draft.body)
            event_types = [json.loads(line)["event_type"] for line in ledger.path.read_text().splitlines()]
            self.assertIn("execution.skipped", event_types)
            self.assertIn("memory.updated", event_types)
            self.assertIn("pr.prepared", event_types)

    def test_router_clamps_requested_agents_to_one_through_five(self) -> None:
        router = LogicalAgentRouter()
        plan = ApprovedPlan(
            plan_id="APOLO-CLI-07",
            title="Run executor",
            objective="Exercise run workflow",
            tasks=("one",),
            approved=True,
        )

        high = router.route(
            RunRequest(
                plan_id=plan.plan_id,
                repository=Path.cwd(),
                objective=plan.objective,
                requested_agents=99,
            ),
            plan,
        )
        low = router.route(
            RunRequest(
                plan_id=plan.plan_id,
                repository=Path.cwd(),
                objective=plan.objective,
                requested_agents=0,
            ),
            plan,
        )

        self.assertEqual(len(high), 5)
        self.assertEqual(len(low), 1)


if __name__ == "__main__":
    unittest.main()
