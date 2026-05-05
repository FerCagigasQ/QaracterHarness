from __future__ import annotations

from pathlib import Path
from typing import Protocol, Sequence

from run.types import (
    AgentAssignment,
    ApprovalDecision,
    ApprovedPlan,
    ExecutionResult,
    PrDraft,
    RunRequest,
    VerificationResult,
)


class PlanStore(Protocol):
    def load_approved_plan(self, plan_id: str) -> ApprovedPlan:
        pass


class SecurityPolicy(Protocol):
    def assert_plan_can_run(self, plan: ApprovedPlan) -> None:
        pass


class ApprovalGateway(Protocol):
    def request_execution_approval(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> ApprovalDecision:
        pass


class AgentRouter(Protocol):
    def route(self, request: RunRequest, plan: ApprovedPlan) -> Sequence[AgentAssignment]:
        pass


class AgentExecutor(Protocol):
    def execute(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> Sequence[ExecutionResult]:
        pass


class VerificationRunner(Protocol):
    def run(self, repository: Path) -> Sequence[VerificationResult]:
        pass


class MemoryStore(Protocol):
    def record_run(self, request: RunRequest, result: Sequence[ExecutionResult]) -> None:
        pass


class GitWorkflow(Protocol):
    def prepare_branch(self, request: RunRequest) -> str:
        pass

    def prepare_pr_draft(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        verification: Sequence[VerificationResult],
    ) -> PrDraft:
        pass


class InitHooks(Protocol):
    def before_run(self, request: RunRequest) -> None:
        pass

    def after_run(self, request: RunRequest) -> None:
        pass
