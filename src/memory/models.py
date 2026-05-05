from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Mapping


class MemoryNamespace(StrEnum):
    GLOBAL = "global"
    REPO = "repo"


class MemoryRecordType(StrEnum):
    DECISION = "decision"
    SUMMARY = "summary"
    OBSERVATION = "observation"
    RUN_EVENT = "run_event"
    TASK = "task"


class RetentionPolicy:
    DEFAULT_DAYS: Mapping[MemoryRecordType, int | None] = {
        MemoryRecordType.DECISION: None,
        MemoryRecordType.SUMMARY: None,
        MemoryRecordType.OBSERVATION: 180,
        MemoryRecordType.RUN_EVENT: 30,
        MemoryRecordType.TASK: 90,
    }


@dataclass(frozen=True)
class MemoryRecord:
    record_type: MemoryRecordType
    title: str
    body: str
    namespace: MemoryNamespace
    id: str | None = None
    tags: tuple[str, ...] = ()
    source: str | None = None
    repo_path: Path | None = None
    metadata: Mapping[str, str | int | float | bool | None] = field(default_factory=dict)
    sensitivity: str = "redacted"
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_accessed_at: datetime | None = None
    expires_at: datetime | None = None
    is_compacted: bool = False
    markdown_path: Path | None = None


@dataclass(frozen=True)
class MemoryQuery:
    namespace: MemoryNamespace | None = None
    text: str | None = None
    record_types: tuple[MemoryRecordType, ...] = ()
    tags: tuple[str, ...] = ()
    include_compacted: bool = False
    limit: int = 20


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def from_iso(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value)
