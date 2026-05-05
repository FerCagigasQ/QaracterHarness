from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path


class TaskKind(StrEnum):
    SIMPLE = "simple"
    BUG = "bug"
    FEATURE = "feature"
    SECURITY = "security"
    PERFORMANCE = "performance"


class DetectionState(StrEnum):
    AVAILABLE = "available"
    MISSING = "missing"


@dataclass(frozen=True)
class AgentCapability:
    task_kinds: frozenset[TaskKind]
    can_coordinate: bool = False
    can_open_pr: bool = False
    can_write_atlassian: bool = False
    local_execution: bool = True
    notes: tuple[str, ...] = ()

    def supports(self, task_kind: TaskKind) -> bool:
        return task_kind in self.task_kinds


@dataclass(frozen=True)
class AgentDetection:
    agent_id: str
    display_name: str
    state: DetectionState
    executable: str | None = None
    checked_candidates: tuple[str, ...] = ()

    @property
    def available(self) -> bool:
        return self.state == DetectionState.AVAILABLE


@dataclass(frozen=True)
class CommandSpec:
    agent_id: str
    argv: tuple[str, ...]
    cwd: Path | None = None
    env: dict[str, str] = field(default_factory=dict)
    dry_run: bool = True
    dangerous: bool = False

    def display(self) -> str:
        return " ".join(self.argv)
