from __future__ import annotations

from pathlib import Path

from run.approval import PendingHumanApprovalGateway
from run.execution import DelegatingExecutor, DryRunExecutor
from run.interfaces import (
    AgentExecutor,
    AgentRouter,
    ApprovalGateway,
    GitWorkflow,
    InitHooks,
    MemoryStore,
    PlanStore,
    SecurityPolicy,
    VerificationRunner,
)
from run.ledger import RunLedger
from run.routing import LogicalAgentRouter
from run.types import (
    ApprovalStatus,
    ExecutionMode,
    ExecutionResult,
    PrDraft,
    RunRequest,
    RunResult,
    RunState,
    VerificationResult,
)


class NoopInitHooks:
    def before_run(self, request: RunRequest) -> None:
        pass

    def after_run(self, request: RunRequest) -> None:
        pass


class NoopSecurityPolicy:
    def assert_plan_can_run(self, plan) -> None:
        if not plan.approved:
            raise ValueError(f"Plan {plan.plan_id} is not approved.")


class NoopMemoryStore:
    def record_run(self, request: RunRequest, result: tuple[ExecutionResult, ...]) -> None:
        pass


class NoopVerificationRunner:
    def run(self, repository: Path) -> tuple[VerificationResult, ...]:
        return ()


class RunOrchestrator:
    def __init__(
        self,
        plan_store: PlanStore,
        git_workflow: GitWorkflow,
        ledger: RunLedger,
        security_policy: SecurityPolicy | None = None,
        approval_gateway: ApprovalGateway | None = None,
        router: AgentRouter | None = None,
        executor: AgentExecutor | None = None,
        verification_runner: VerificationRunner | None = None,
        memory_store: MemoryStore | None = None,
        init_hooks: InitHooks | None = None,
    ) -> None:
        self.plan_store = plan_store
        self.git_workflow = git_workflow
        self.ledger = ledger
        self.security_policy = security_policy or NoopSecurityPolicy()
        self.approval_gateway = approval_gateway or PendingHumanApprovalGateway()
        self.router = router or LogicalAgentRouter()
        self.executor = executor
        self.verification_runner = verification_runner or NoopVerificationRunner()
        self.memory_store = memory_store or NoopMemoryStore()
        self.init_hooks = init_hooks or NoopInitHooks()

    def run(self, request: RunRequest) -> RunResult:
        plan = None
        approval = None
        assignments = ()
        execution_results = ()
        verification_results = ()
        pr_draft: PrDraft | None = None

        try:
            self.ledger.record("run.created", {"plan_id": request.plan_id, "mode": request.mode.value})
            self.init_hooks.before_run(request)

            plan = self.plan_store.load_approved_plan(request.plan_id)
            self.ledger.record("plan.loaded", {"plan_id": plan.plan_id, "approved": plan.approved})

            self.security_policy.assert_plan_can_run(plan)
            self.ledger.record("security.checked", {"plan_id": plan.plan_id})

            assignments = tuple(self.router.route(request, plan))
            self.ledger.record("agents.routed", {"count": len(assignments)})

            approval = self.approval_gateway.request_execution_approval(request, plan, assignments)
            self.ledger.record("approval.requested", {"status": approval.status.value})

            if approval.status is not ApprovalStatus.APPROVED:
                state = RunState.REJECTED if approval.status is ApprovalStatus.REJECTED else RunState.APPROVAL_REQUIRED
                self.ledger.record("run.paused", {"state": state.value})
                return RunResult(
                    state=state,
                    plan=plan,
                    approval=approval,
                    assignments=assignments,
                    execution_results=execution_results,
                    verification_results=verification_results,
                    pr_draft=pr_draft,
                    ledger_path=self.ledger.path,
                )

            branch_name = self.git_workflow.prepare_branch(request)
            self.ledger.record("git.branch.prepared", {"branch": branch_name})

            executor = self.executor or self._default_executor(request)
            execution_results = tuple(executor.execute(request, plan, assignments))
            event_type = "execution.skipped" if request.mode is ExecutionMode.DRY_RUN else "execution.completed"
            self.ledger.record(event_type, {"count": len(execution_results)})

            verification_results = tuple(self.verification_runner.run(request.repository))
            self.ledger.record(
                "verification.completed",
                {"passed": all(result.passed for result in verification_results), "count": len(verification_results)},
            )

            self.memory_store.record_run(request, execution_results)
            self.ledger.record("memory.updated", {"plan_id": plan.plan_id})

            pr_draft = self.git_workflow.prepare_pr_draft(request, plan, verification_results)
            self.ledger.record("pr.prepared", {"provider": pr_draft.provider, "branch": pr_draft.branch_name})

            self.init_hooks.after_run(request)
            self.ledger.record("run.completed", {"plan_id": plan.plan_id})
            return RunResult(
                state=RunState.COMPLETED,
                plan=plan,
                approval=approval,
                assignments=assignments,
                execution_results=execution_results,
                verification_results=verification_results,
                pr_draft=pr_draft,
                ledger_path=self.ledger.path,
            )
        except Exception as exc:
            self.ledger.record("run.failed", {"error": str(exc)})
            return RunResult(
                state=RunState.FAILED,
                plan=plan,
                approval=approval,
                assignments=assignments,
                execution_results=execution_results,
                verification_results=verification_results,
                pr_draft=pr_draft,
                ledger_path=self.ledger.path,
            )

    def _default_executor(self, request: RunRequest) -> AgentExecutor:
        if request.mode is ExecutionMode.DRY_RUN:
            return DryRunExecutor()
        return DelegatingExecutor()
