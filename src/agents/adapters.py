from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from src.agents.capabilities import AgentCapability, CommandSpec, TaskKind

MAX_AGENTS = 5
DEFAULT_COORDINATOR_ID = "claude-code"


class AgentAdapter(Protocol):
    agent_id: str
    display_name: str
    executable_candidates: tuple[str, ...]
    capabilities: AgentCapability

    def build_command(
        self,
        prompt: str,
        *,
        executable: str | None = None,
        cwd: Path | str | None = None,
        dry_run: bool = True,
        extra_args: tuple[str, ...] = (),
    ) -> CommandSpec:
        ...


@dataclass(frozen=True)
class BaseCliAdapter:
    agent_id: str
    display_name: str
    executable_candidates: tuple[str, ...]
    capabilities: AgentCapability
    invocation: tuple[str, ...]

    def build_command(
        self,
        prompt: str,
        *,
        executable: str | None = None,
        cwd: Path | str | None = None,
        dry_run: bool = True,
        extra_args: tuple[str, ...] = (),
    ) -> CommandSpec:
        selected_executable = executable or self.executable_candidates[0]
        argv = tuple(
            selected_executable if part == "{executable}" else prompt if part == "{prompt}" else part
            for part in self.invocation
        )
        if argv[0] != selected_executable:
            argv = (selected_executable, *argv[1:])
        return CommandSpec(
            agent_id=self.agent_id,
            argv=(*argv, *extra_args),
            cwd=Path(cwd) if cwd is not None else None,
            dry_run=dry_run,
            dangerous=not dry_run,
        )


ALL_TASKS = frozenset(TaskKind)
CODE_TASKS = frozenset(
    {
        TaskKind.SIMPLE,
        TaskKind.BUG,
        TaskKind.FEATURE,
        TaskKind.PERFORMANCE,
    }
)


def default_adapters() -> tuple[BaseCliAdapter, ...]:
    return (
        BaseCliAdapter(
            agent_id="claude-code",
            display_name="Claude Code",
            executable_candidates=("claude",),
            capabilities=AgentCapability(
                task_kinds=ALL_TASKS,
                can_coordinate=True,
                can_open_pr=True,
                can_write_atlassian=True,
                notes=("default coordinator",),
            ),
            invocation=("{executable}", "--print", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="codex-cli",
            display_name="Codex CLI",
            executable_candidates=("codex",),
            capabilities=AgentCapability(
                task_kinds=ALL_TASKS,
                can_open_pr=True,
                can_write_atlassian=True,
            ),
            invocation=("{executable}", "exec", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="github-copilot-cli",
            display_name="GitHub Copilot CLI",
            executable_candidates=("gh",),
            capabilities=AgentCapability(task_kinds=CODE_TASKS),
            invocation=("{executable}", "copilot", "suggest", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="opencode",
            display_name="OpenCode",
            executable_candidates=("opencode",),
            capabilities=AgentCapability(
                task_kinds=frozenset(
                    {
                        TaskKind.SIMPLE,
                        TaskKind.BUG,
                        TaskKind.FEATURE,
                        TaskKind.SECURITY,
                        TaskKind.PERFORMANCE,
                    }
                )
            ),
            invocation=("{executable}", "run", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="gemini-cli",
            display_name="Gemini CLI",
            executable_candidates=("gemini",),
            capabilities=AgentCapability(
                task_kinds=frozenset(
                    {
                        TaskKind.SIMPLE,
                        TaskKind.FEATURE,
                        TaskKind.SECURITY,
                        TaskKind.PERFORMANCE,
                    }
                )
            ),
            invocation=("{executable}", "--prompt", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="cursor-cli",
            display_name="Cursor CLI",
            executable_candidates=("cursor-agent", "cursor"),
            capabilities=AgentCapability(task_kinds=CODE_TASKS),
            invocation=("{executable}", "--prompt", "{prompt}"),
        ),
        BaseCliAdapter(
            agent_id="ollama-qwen",
            display_name="Ollama Qwen",
            executable_candidates=("ollama",),
            capabilities=AgentCapability(
                task_kinds=frozenset({TaskKind.SIMPLE, TaskKind.BUG, TaskKind.PERFORMANCE}),
                local_execution=True,
                notes=("default model qwen2.5-coder:latest",),
            ),
            invocation=("{executable}", "run", "qwen2.5-coder:latest", "{prompt}"),
        ),
    )


def get_adapter(agent_id: str, adapters: tuple[BaseCliAdapter, ...] | None = None) -> BaseCliAdapter:
    for adapter in adapters or default_adapters():
        if adapter.agent_id == agent_id:
            return adapter
    raise KeyError(f"Unknown agent adapter: {agent_id}")
