from __future__ import annotations

from enum import Enum
from typing import Sequence

from run.types import ApprovedPlan, PrDraft, RunRequest, VerificationResult


class PrProvider(str, Enum):
    CLAUDE = "claude"
    CODEX = "codex"


class PrWorkflow:
    def __init__(self, provider: PrProvider, branch_strategy=None) -> None:
        self.provider = provider
        self.branch_strategy = branch_strategy
        self._branch_name: str | None = None

    def prepare_branch(self, request: RunRequest) -> str:
        if request.branch_name:
            self._branch_name = request.branch_name
            return request.branch_name
        if self.branch_strategy is None:
            from .branching import BranchStrategy

            self.branch_strategy = BranchStrategy()
        self._branch_name = self.branch_strategy.branch_for(request)
        return self._branch_name

    def prepare_pr_draft(
        self,
        request: RunRequest,
        plan: ApprovedPlan,
        verification: Sequence[VerificationResult],
    ) -> PrDraft:
        branch_name = self._branch_name or self.prepare_branch(request)
        checks = "\n".join(
            f"- {'PASS' if result.passed else 'FAIL'} `{result.name}`: `{' '.join(result.command)}`"
            for result in verification
        )
        if not checks:
            checks = "- No verification commands detected."
        return PrDraft(
            provider=self.provider.value,
            title=f"{plan.title}",
            body=(
                "## Summary\n"
                f"- Objective: {plan.objective}\n"
                f"- Plan: {plan.plan_id}\n\n"
                "## Verification\n"
                f"{checks}\n\n"
                "## Approval\n"
                "- Human approval is required before execution.\n"
            ),
            branch_name=branch_name,
            base_branch=request.base_branch,
            dry_run=request.mode.value == "dry_run",
        )
