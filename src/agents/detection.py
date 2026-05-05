from __future__ import annotations

import shutil
from collections.abc import Callable, Iterable

from src.agents.adapters import BaseCliAdapter, default_adapters
from src.agents.capabilities import AgentDetection, DetectionState

ExecutableResolver = Callable[[str], str | None]


def detect_local_agents(
    adapters: Iterable[BaseCliAdapter] | None = None,
    *,
    resolver: ExecutableResolver = shutil.which,
) -> tuple[AgentDetection, ...]:
    detections: list[AgentDetection] = []
    for adapter in adapters or default_adapters():
        executable = _first_resolved(adapter.executable_candidates, resolver)
        detections.append(
            AgentDetection(
                agent_id=adapter.agent_id,
                display_name=adapter.display_name,
                state=DetectionState.AVAILABLE if executable else DetectionState.MISSING,
                executable=executable,
                checked_candidates=adapter.executable_candidates,
            )
        )
    return tuple(detections)


def detected_adapters(
    adapters: Iterable[BaseCliAdapter] | None = None,
    *,
    detections: Iterable[AgentDetection] | None = None,
    resolver: ExecutableResolver = shutil.which,
) -> tuple[BaseCliAdapter, ...]:
    adapter_list = tuple(adapters or default_adapters())
    detection_map = {
        detection.agent_id: detection
        for detection in (tuple(detections) if detections is not None else detect_local_agents(adapter_list, resolver=resolver))
    }
    return tuple(adapter for adapter in adapter_list if detection_map.get(adapter.agent_id) and detection_map[adapter.agent_id].available)


def _first_resolved(candidates: tuple[str, ...], resolver: ExecutableResolver) -> str | None:
    for candidate in candidates:
        resolved = resolver(candidate)
        if resolved:
            return resolved
    return None
