from __future__ import annotations

from dataclasses import dataclass

from src.agents.adapters import DEFAULT_COORDINATOR_ID, MAX_AGENTS, BaseCliAdapter, default_adapters
from src.agents.capabilities import AgentDetection, CommandSpec, TaskKind
from src.agents.detection import detected_adapters

WRITE_CAPABLE_AGENT_IDS = frozenset({"claude-code", "codex-cli"})


class RoutingError(ValueError):
    pass


@dataclass(frozen=True)
class RoutingRequest:
    prompt: str
    task_kind: TaskKind | None = None
    requested_agent_ids: tuple[str, ...] = ()
    require_pr_write: bool = False
    require_atlassian_write: bool = False
    max_agents: int = MAX_AGENTS


@dataclass(frozen=True)
class RoutingDecision:
    task_kind: TaskKind
    coordinator_id: str
    agent_ids: tuple[str, ...]
    dry_run_commands: tuple[CommandSpec, ...]
    reasons: tuple[str, ...]


def classify_task(prompt: str) -> TaskKind:
    normalized = prompt.lower()
    keyword_map = (
        (TaskKind.SECURITY, ("security", "vulnerability", "cve", "secret", "auth", "owasp", "sast")),
        (TaskKind.PERFORMANCE, ("performance", "latency", "slow", "optimize", "throughput", "profil")),
        (TaskKind.BUG, ("bug", "fix", "broken", "error", "exception", "fail", "regression")),
        (TaskKind.FEATURE, ("feature", "implement", "add", "build", "create", "support")),
    )
    for task_kind, keywords in keyword_map:
        if any(keyword in normalized for keyword in keywords):
            return task_kind
    return TaskKind.SIMPLE


def route_task(
    request: RoutingRequest,
    *,
    adapters: tuple[BaseCliAdapter, ...] | None = None,
    detections: tuple[AgentDetection, ...] | None = None,
) -> RoutingDecision:
    if request.max_agents > MAX_AGENTS:
        raise RoutingError(f"max_agents cannot exceed {MAX_AGENTS}")
    if request.max_agents < 1:
        raise RoutingError("max_agents must be at least 1")

    adapter_list = adapters or default_adapters()
    available_adapters = detected_adapters(adapter_list, detections=detections)
    if not available_adapters:
        raise RoutingError("No local agent executables detected")

    task_kind = request.task_kind or classify_task(request.prompt)
    if request.requested_agent_ids:
        selected = _requested_adapters(request.requested_agent_ids, available_adapters)
        reasons = ("using explicitly requested local agents",)
    else:
        selected = _heuristic_adapters(task_kind, available_adapters)
        reasons = (f"selected agents supporting {task_kind.value} tasks",)

    selected = _enforce_write_policy(selected, request)
    selected = _ensure_coordinator(selected, available_adapters)
    selected = _dedupe(selected)

    if len(selected) > request.max_agents:
        raise RoutingError(f"routing selected {len(selected)} agents, above max_agents={request.max_agents}")

    coordinator_id = _coordinator_id(selected)
    dry_run_commands = tuple(adapter.build_command(request.prompt, dry_run=True) for adapter in selected)
    return RoutingDecision(
        task_kind=task_kind,
        coordinator_id=coordinator_id,
        agent_ids=tuple(adapter.agent_id for adapter in selected),
        dry_run_commands=dry_run_commands,
        reasons=reasons + (f"coordinator={coordinator_id}", f"dry_run_commands={len(dry_run_commands)}"),
    )


def _requested_adapters(
    requested_agent_ids: tuple[str, ...],
    available_adapters: tuple[BaseCliAdapter, ...],
) -> tuple[BaseCliAdapter, ...]:
    available_by_id = {adapter.agent_id: adapter for adapter in available_adapters}
    missing = tuple(agent_id for agent_id in requested_agent_ids if agent_id not in available_by_id)
    if missing:
        raise RoutingError(f"Requested agents are not locally available: {', '.join(missing)}")
    return tuple(available_by_id[agent_id] for agent_id in requested_agent_ids)


def _heuristic_adapters(
    task_kind: TaskKind,
    available_adapters: tuple[BaseCliAdapter, ...],
) -> tuple[BaseCliAdapter, ...]:
    priorities = {
        TaskKind.SIMPLE: ("claude-code", "ollama-qwen", "codex-cli"),
        TaskKind.BUG: ("claude-code", "codex-cli", "cursor-cli", "ollama-qwen", "github-copilot-cli"),
        TaskKind.FEATURE: ("claude-code", "codex-cli", "cursor-cli", "gemini-cli", "opencode"),
        TaskKind.SECURITY: ("claude-code", "codex-cli", "gemini-cli", "opencode"),
        TaskKind.PERFORMANCE: ("claude-code", "codex-cli", "gemini-cli", "opencode", "cursor-cli", "ollama-qwen"),
    }
    available_by_id = {adapter.agent_id: adapter for adapter in available_adapters}
    selected = tuple(
        available_by_id[agent_id]
        for agent_id in priorities[task_kind]
        if agent_id in available_by_id and available_by_id[agent_id].capabilities.supports(task_kind)
    )
    return selected or tuple(adapter for adapter in available_adapters if adapter.capabilities.supports(task_kind))


def _enforce_write_policy(
    selected: tuple[BaseCliAdapter, ...],
    request: RoutingRequest,
) -> tuple[BaseCliAdapter, ...]:
    if not (request.require_pr_write or request.require_atlassian_write):
        return selected
    write_capable = tuple(adapter for adapter in selected if adapter.agent_id in WRITE_CAPABLE_AGENT_IDS)
    if not write_capable:
        raise RoutingError("PR and Atlassian writes require Claude Code or Codex CLI")
    return write_capable


def _ensure_coordinator(
    selected: tuple[BaseCliAdapter, ...],
    available_adapters: tuple[BaseCliAdapter, ...],
) -> tuple[BaseCliAdapter, ...]:
    if any(adapter.agent_id == DEFAULT_COORDINATOR_ID for adapter in selected):
        return selected
    default = next((adapter for adapter in available_adapters if adapter.agent_id == DEFAULT_COORDINATOR_ID), None)
    if default:
        return (default, *selected)
    coordinator = next((adapter for adapter in available_adapters if adapter.capabilities.can_coordinate), None)
    return (coordinator, *selected) if coordinator else selected


def _coordinator_id(selected: tuple[BaseCliAdapter, ...]) -> str:
    for adapter in selected:
        if adapter.agent_id == DEFAULT_COORDINATOR_ID:
            return adapter.agent_id
    for adapter in selected:
        if adapter.capabilities.can_coordinate:
            return adapter.agent_id
    return selected[0].agent_id


def _dedupe(adapters: tuple[BaseCliAdapter, ...]) -> tuple[BaseCliAdapter, ...]:
    seen: set[str] = set()
    deduped: list[BaseCliAdapter] = []
    for adapter in adapters:
        if adapter.agent_id not in seen:
            seen.add(adapter.agent_id)
            deduped.append(adapter)
    return tuple(deduped)
