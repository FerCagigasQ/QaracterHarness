from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from run.types import VerificationResult


@dataclass(frozen=True)
class DetectedCommand:
    name: str
    command: tuple[str, ...]


class VerificationCommandDetector:
    def detect(self, repository: Path) -> tuple[DetectedCommand, ...]:
        commands: list[DetectedCommand] = []
        commands.extend(self._detect_python(repository))
        commands.extend(self._detect_node(repository))
        commands.extend(self._detect_make(repository))
        return tuple(commands)

    def _detect_python(self, repository: Path) -> tuple[DetectedCommand, ...]:
        if (repository / "tests" / "run").exists():
            return (DetectedCommand("python-tests", ("python", "-m", "unittest", "discover", "-s", "tests/run")),)
        if (repository / "pyproject.toml").exists() or (repository / "tests").exists():
            return (DetectedCommand("python-tests", ("python", "-m", "unittest", "discover", "-s", "tests")),)
        return ()

    def _detect_node(self, repository: Path) -> tuple[DetectedCommand, ...]:
        package_json = repository / "package.json"
        if not package_json.exists():
            return ()
        scripts = json.loads(package_json.read_text(encoding="utf-8")).get("scripts", {})
        commands: list[DetectedCommand] = []
        for script in ("lint", "typecheck", "build", "test"):
            if script in scripts:
                commands.append(DetectedCommand(f"npm-{script}", ("npm", "run", script)))
        return tuple(commands)

    def _detect_make(self, repository: Path) -> tuple[DetectedCommand, ...]:
        makefile = repository / "Makefile"
        if not makefile.exists():
            return ()
        content = makefile.read_text(encoding="utf-8")
        commands: list[DetectedCommand] = []
        for target in ("lint", "typecheck", "build", "test"):
            if f"{target}:" in content:
                commands.append(DetectedCommand(f"make-{target}", ("make", target)))
        return tuple(commands)


class CommandRunner:
    def __init__(self, detector: VerificationCommandDetector | None = None, timeout_seconds: int = 600) -> None:
        self.detector = detector or VerificationCommandDetector()
        self.timeout_seconds = timeout_seconds

    def run(self, repository: Path) -> tuple[VerificationResult, ...]:
        return tuple(self.run_command(repository, command) for command in self.detector.detect(repository))

    def run_command(self, repository: Path, command: DetectedCommand) -> VerificationResult:
        completed = subprocess.run(
            command.command,
            cwd=repository,
            capture_output=True,
            check=False,
            text=True,
            timeout=self.timeout_seconds,
        )
        return VerificationResult(
            name=command.name,
            command=command.command,
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
