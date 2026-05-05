from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4


@dataclass(frozen=True)
class LedgerEvent:
    event_id: str
    event_type: str
    timestamp: str
    payload: Mapping[str, Any] = field(default_factory=dict)


class RunLedger:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._events: list[LedgerEvent] = []

    @property
    def events(self) -> tuple[LedgerEvent, ...]:
        return tuple(self._events)

    def record(self, event_type: str, payload: Mapping[str, Any] | None = None) -> LedgerEvent:
        event = LedgerEvent(
            event_id=str(uuid4()),
            event_type=event_type,
            timestamp=datetime.now(UTC).isoformat(),
            payload=payload or {},
        )
        self._events.append(event)
        self.flush()
        return event

    def flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as output:
            for event in self._events:
                output.write(json.dumps(asdict(event), sort_keys=True))
                output.write("\n")
