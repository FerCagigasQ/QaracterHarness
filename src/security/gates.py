from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from src.policy.config import PolicyConfig
from src.security.redaction import contains_sensitive_data, find_sensitive_data


@dataclass(frozen=True)
class ApprovalContext:
    human_run_approved: bool = False
    destructive_ops_approved: bool = False
    tool_policy_approved: bool = False
    write_scope_approved: bool = False
    diff_approved: bool = False
    memory_write_approved: bool = False
    budget_approved: bool = False


@dataclass(frozen=True)
class ToolCall:
    name: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FileWrite:
    path: str
    content: str = ""


@dataclass(frozen=True)
class MemoryWrite:
    key: str
    value: str


@dataclass(frozen=True)
class DiffStats:
    files_changed: int = 0
    lines_changed: int = 0
    max_single_file_lines_changed: int = 0


@dataclass(frozen=True)
class BudgetUsage:
    tool_calls: int = 0
    runtime_minutes: int = 0
    estimated_cost_usd: float = 0.0


@dataclass(frozen=True)
class PlanRequest:
    actor: str
    tools: tuple[ToolCall, ...] = ()
    commands: tuple[str, ...] = ()
    file_writes: tuple[FileWrite, ...] = ()
    memory_writes: tuple[MemoryWrite, ...] = ()
    diff: DiffStats = field(default_factory=DiffStats)
    budget: BudgetUsage = field(default_factory=BudgetUsage)
    approvals: ApprovalContext = field(default_factory=ApprovalContext)


@dataclass(frozen=True)
class GateDecision:
    gate: str
    allowed: bool
    reason: str
    requires_approval: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class SecurityGateEngine:
    def __init__(self, config: PolicyConfig | None = None) -> None:
        self.config = config or PolicyConfig.defaults()

    def evaluate(self, request: PlanRequest) -> list[GateDecision]:
        decisions: list[GateDecision] = []
        decisions.extend(self._check_human_approval(request))
        decisions.extend(self._check_secrets(request))
        decisions.extend(self._check_destructive_ops(request))
        decisions.extend(self._check_tool_allowlist(request))
        decisions.extend(self._check_write_scope(request))
        decisions.extend(self._check_memory_writes(request))
        decisions.extend(self._check_budget(request))
        decisions.extend(self._check_diff_size(request))
        decisions.extend(self._check_permissions(request))
        return decisions

    def is_allowed(self, request: PlanRequest) -> bool:
        return all(decision.allowed for decision in self.evaluate(request))

    def _check_human_approval(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.approval
        if (
            policy.human_approval_required_before_run
            and not request.approvals.human_run_approved
        ):
            return [
                GateDecision(
                    gate="human_approval",
                    allowed=False,
                    reason="human approval is required before any run",
                    requires_approval=True,
                )
            ]
        return []

    def _check_secrets(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.secrets
        if not policy.enabled:
            return []

        decisions: list[GateDecision] = []
        candidates: list[tuple[str, str]] = []
        candidates.extend(
            (f"command[{index}]", command)
            for index, command in enumerate(request.commands)
        )
        candidates.extend(
            (f"file_write[{item.path}]", item.content)
            for item in request.file_writes
        )
        candidates.extend(
            (f"memory_write[{item.key}]", item.value)
            for item in request.memory_writes
        )
        for tool in request.tools:
            candidates.append((f"tool[{tool.name}]", repr(tool.args)))

        for location, value in candidates:
            matches = find_sensitive_data(value, policy)
            if matches:
                decisions.append(
                    GateDecision(
                        gate="secrets",
                        allowed=False,
                        reason="sensitive data detected and blocked",
                        metadata={
                            "location": location,
                            "kinds": sorted({match.kind for match in matches}),
                        },
                    )
                )
        return decisions

    def _check_destructive_ops(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.destructive_ops
        if not policy.enabled:
            return []

        decisions: list[GateDecision] = []
        for command in request.commands:
            for pattern in policy.blocked_patterns:
                if re.search(pattern, command, re.IGNORECASE):
                    decisions.append(
                        GateDecision(
                            gate="destructive_ops",
                            allowed=request.approvals.destructive_ops_approved,
                            reason="destructive operation requires explicit approval",
                            requires_approval=True,
                            metadata={"pattern": pattern},
                        )
                    )
                    break
        return decisions

    def _check_tool_allowlist(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.tool_allowlist
        if not policy.enabled:
            return []

        allowed_tools = set(policy.allowed_tools)
        decisions: list[GateDecision] = []
        for tool in request.tools:
            if tool.name not in allowed_tools:
                decisions.append(
                    GateDecision(
                        gate="tool_allowlist",
                        allowed=request.approvals.tool_policy_approved,
                        reason="tool is not in the configured allowlist",
                        requires_approval=True,
                        metadata={"tool": tool.name},
                    )
                )
        return decisions

    def _check_write_scope(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.write_scope
        if not policy.enabled:
            return []

        decisions: list[GateDecision] = []
        for file_write in request.file_writes:
            normalized = _normalize_relative_path(file_write.path)
            denied = _matches_any_denied(normalized, policy.denied_paths)
            allowed = _matches_any_allowed(normalized, policy.allowed_paths)
            if denied or not allowed:
                decisions.append(
                    GateDecision(
                        gate="write_scope",
                        allowed=request.approvals.write_scope_approved,
                        reason="write target is outside the configured scope",
                        requires_approval=True,
                        metadata={
                            "path": normalized,
                            "denied": denied,
                            "allowed": allowed,
                        },
                    )
                )
        return decisions

    def _check_memory_writes(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.memory_write
        if not policy.enabled:
            return []

        decisions: list[GateDecision] = []
        for memory_write in request.memory_writes:
            if len(memory_write.value) > policy.max_value_length:
                decisions.append(
                    GateDecision(
                        gate="memory_write",
                        allowed=request.approvals.memory_write_approved,
                        reason="memory write exceeds configured maximum length",
                        requires_approval=True,
                        metadata={"key": memory_write.key},
                    )
                )
            if policy.block_sensitive_data and contains_sensitive_data(
                memory_write.value,
                self.config.secrets,
            ):
                decisions.append(
                    GateDecision(
                        gate="memory_write",
                        allowed=request.approvals.memory_write_approved,
                        reason="memory write contains sensitive data",
                        requires_approval=True,
                        metadata={"key": memory_write.key},
                    )
                )
        return decisions

    def _check_budget(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.budget
        if not policy.enabled:
            return []

        overages: dict[str, float] = {}
        if request.budget.tool_calls > policy.max_tool_calls:
            overages["tool_calls"] = request.budget.tool_calls
        if request.budget.runtime_minutes > policy.max_runtime_minutes:
            overages["runtime_minutes"] = request.budget.runtime_minutes
        if request.budget.estimated_cost_usd > policy.max_estimated_cost_usd:
            overages["estimated_cost_usd"] = request.budget.estimated_cost_usd

        if not overages:
            return []

        return [
            GateDecision(
                gate="budget",
                allowed=request.approvals.budget_approved,
                reason="run exceeds configured budget",
                requires_approval=True,
                metadata={"overages": overages},
            )
        ]

    def _check_diff_size(self, request: PlanRequest) -> list[GateDecision]:
        policy = self.config.diff_size
        if not policy.enabled:
            return []

        overages: dict[str, int] = {}
        if request.diff.files_changed > policy.max_files_changed:
            overages["files_changed"] = request.diff.files_changed
        if request.diff.lines_changed > policy.max_lines_changed:
            overages["lines_changed"] = request.diff.lines_changed
        if (
            request.diff.max_single_file_lines_changed
            > policy.max_single_file_lines_changed
        ):
            overages["max_single_file_lines_changed"] = (
                request.diff.max_single_file_lines_changed
            )

        if not overages:
            return []

        return [
            GateDecision(
                gate="diff_size",
                allowed=request.approvals.diff_approved,
                reason="diff exceeds configured risk threshold",
                requires_approval=True,
                metadata={"overages": overages},
            )
        ]

    def _check_permissions(self, request: PlanRequest) -> list[GateDecision]:
        decisions: list[GateDecision] = []
        actor = request.actor.lower()
        pr_tools = {"create_pr", "update_pr"}
        for tool in request.tools:
            if tool.name in pr_tools and actor not in self.config.permissions.pr_writers:
                decisions.append(
                    GateDecision(
                        gate="pr_permission",
                        allowed=False,
                        reason="actor is not permitted to create or update PRs",
                        metadata={"actor": request.actor, "tool": tool.name},
                    )
                )
            if (
                tool.name == "atlassian_write"
                and actor not in self.config.permissions.atlassian_writers
            ):
                decisions.append(
                    GateDecision(
                        gate="atlassian_write_permission",
                        allowed=False,
                        reason="actor is not permitted to perform Atlassian writes",
                        metadata={"actor": request.actor},
                    )
                )
        return decisions


def _normalize_relative_path(path: str) -> str:
    normalized = PurePosixPath(path.replace("\\", "/"))
    parts = [part for part in normalized.parts if part not in ("", ".")]
    if any(part == ".." for part in parts) or normalized.is_absolute():
        return "../" + "/".join(part for part in parts if part != "/")
    return "/".join(parts)


def _matches_any_allowed(path: str, candidates: tuple[str, ...]) -> bool:
    return any(_matches_allowed_path(path, candidate) for candidate in candidates)


def _matches_any_denied(path: str, candidates: tuple[str, ...]) -> bool:
    return any(_matches_denied_path(path, candidate) for candidate in candidates)


def _matches_allowed_path(path: str, candidate: str) -> bool:
    if candidate.endswith("/"):
        return path == candidate[:-1] or path.startswith(candidate)
    return path == candidate or path.startswith(f"{candidate}/")


def _matches_denied_path(path: str, candidate: str) -> bool:
    if _matches_allowed_path(path, candidate):
        return True
    normalized_candidate = candidate.strip("/")
    if not normalized_candidate:
        return False
    return (
        path.endswith(f"/{normalized_candidate}")
        or f"/{normalized_candidate}/" in path
        or f"/{normalized_candidate}" in path
    )
