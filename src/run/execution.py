from __future__ import annotations

from typing import Sequence

from run.types import AgentAssignment, ApprovedPlan, ExecutionResult, RunRequest


class DryRunExecutor:
    def execute(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> tuple[ExecutionResult, ...]:
        return tuple(
            ExecutionResult(
                assignment=assignment,
                status="skipped",
                summary=f"Dry run planned task: {assignment.task}",
            )
            for assignment in assignments
        )


class DelegatingExecutor:
    def execute(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        assignments: Sequence[AgentAssignment],
    ) -> tuple[ExecutionResult, ...]:
        return tuple(
            ExecutionResult(
                assignment=assignment,
                status="delegated",
                summary=f"Delegated approved task: {assignment.task}",
            )
            for assignment in assignments
        )
