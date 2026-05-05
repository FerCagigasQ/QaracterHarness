from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Protocol

from src.agents.capabilities import CommandSpec


@dataclass(frozen=True)
class ExecutionResult:
    command: CommandSpec
    return_code: int
    stdout: str = ""
    stderr: str = ""
    executed: bool = False


class RunExecutor(Protocol):
    def execute(self, command: CommandSpec) -> ExecutionResult:
        ...


class DryRunExecutor:
    def execute(self, command: CommandSpec) -> ExecutionResult:
        return ExecutionResult(
            command=command,
            return_code=0,
            stdout=command.display(),
            executed=False,
        )


class SubprocessRunExecutor:
    def __init__(self, *, allow_dangerous: bool = False) -> None:
        self.allow_dangerous = allow_dangerous

    def execute(self, command: CommandSpec) -> ExecutionResult:
        if command.dry_run:
            return DryRunExecutor().execute(command)
        if command.dangerous and not self.allow_dangerous:
            raise PermissionError("Command execution requires allow_dangerous=True")
        completed = subprocess.run(
            command.argv,
            cwd=command.cwd,
            env=command.env or None,
            capture_output=True,
            check=False,
            text=True,
        )
        return ExecutionResult(
            command=command,
            return_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            executed=True,
        )
