from __future__ import annotations

import json
from dataclasses import dataclass

from .models import MemoryQuery, MemoryRecord
from .store import MemoryStore


@dataclass(frozen=True)
class MemoryCommandResult:
    records: tuple[MemoryRecord, ...]
    output: str | None = None


def search_memory(store: MemoryStore, query: MemoryQuery) -> MemoryCommandResult:
    return MemoryCommandResult(tuple(store.search(query)))


def list_memory(store: MemoryStore, query: MemoryQuery | None = None) -> MemoryCommandResult:
    return MemoryCommandResult(tuple(store.list(query)))


def compact_memory(store: MemoryStore, query: MemoryQuery, title: str = "Compacted memory") -> MemoryCommandResult:
    compacted = store.compact(query, title)
    records = (compacted,) if compacted is not None else ()
    return MemoryCommandResult(records)


def export_memory(
    store: MemoryStore,
    query: MemoryQuery | None = None,
    output_format: str = "markdown",
) -> MemoryCommandResult:
    query = query or MemoryQuery(namespace=store.namespace)
    records = tuple(store.list(query))
    if output_format == "markdown":
        return MemoryCommandResult(records, store.export_markdown(query))
    if output_format == "json":
        return MemoryCommandResult(records, json.dumps([_record_to_json(record) for record in records], indent=2))
    raise ValueError(f"Unsupported memory export format: {output_format}")


def _record_to_json(record: MemoryRecord) -> dict[str, object]:
    return {
        "id": record.id,
        "namespace": record.namespace.value,
        "record_type": record.record_type.value,
        "title": record.title,
        "body": record.body,
        "tags": list(record.tags),
        "source": record.source,
        "sensitivity": record.sensitivity,
    }
