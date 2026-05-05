from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Mapping, Sequence


class ExecutionMode(str, Enum):
    DRY_RUN = "dry_run"
    EXECUTE = "execute"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class RunState(str, Enum):
    CREATED = "created"
    PLAN_LOADED = "plan_loaded"
    SECURITY_CHECKED = "security_checked"
    APPROVAL_REQUIRED = "approval_required"
    ROUTED = "routed"
    EXECUTION_SKIPPED = "execution_skipped"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    MEMORY_UPDATED = "memory_updated"
    PR_PREPARED = "pr_prepared"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass(frozen=True)
class RunRequest:
    plan_id: str
    repository: Path
    objective: str
    mode: ExecutionMode = ExecutionMode.DRY_RUN
    requested_agents: int | None = None
    base_branch: str = "main"
    branch_name: str | None = None
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ApprovedPlan:
    plan_id: str
    title: str
    objective: str
    tasks: Sequence[str]
    approved: bool
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ApprovalDecision:
    status: ApprovalStatus
    approver: str | None = None
    reason: str | None = None


@dataclass(frozen=True)
class AgentAssignment:
    agent_id: str
    task: str
    rationale: str


@dataclass(frozen=True)
class ExecutionResult:
    assignment: AgentAssignment
    status: str
    summary: str
    artifacts: Sequence[Path] = field(default_factory=tuple)


@dataclass(frozen=True)
class VerificationResult:
    name: str
    command: Sequence[str]
    exit_code: int
    stdout: str = ""
    stderr: str = ""

    @property
    def passed(self) -> bool:
        return self.exit_code == 0


@dataclass(frozen=True)
class PrDraft:
    provider: str
    title: str
    body: str
    branch_name: str
    base_branch: str
    dry_run: bool = True


@dataclass(frozen=True)
class RunResult:
    state: RunState
    plan: ApprovedPlan | None
    approval: ApprovalDecision | None
    assignments: Sequence[AgentAssignment]
    execution_results: Sequence[ExecutionResult]
    verification_results: Sequence[VerificationResult]
    pr_draft: PrDraft | None
    ledger_path: Path
