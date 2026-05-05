from __future__ import annotations

from typing import Sequence

from run.types import AgentAssignment, ApprovalDecision, ApprovalStatus, ApprovedPlan, RunRequest


class PendingHumanApprovalGateway:
    def request_execution_approval(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> ApprovalDecision:
        return ApprovalDecision(
            status=ApprovalStatus.PENDING,
            reason="Human approval is required before execution.",
        )


class StaticApprovalGateway:
    def __init__(self, decision: ApprovalDecision) -> None:
        self.decision = decision

    def request_execution_approval(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> ApprovalDecision:
        return self.decision
