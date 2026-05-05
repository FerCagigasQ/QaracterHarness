from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_ROOT = REPO_ROOT / "test" / "fixtures"


@dataclass(frozen=True)
class CliResult:
    returncode: int
    stdout: str
    stderr: str


class FixtureWorkspace:
    def __init__(self) -> None:
        self._tempdir = tempfile.TemporaryDirectory(prefix="apolo-fixture-")
        self.path = Path(self._tempdir.name)
        shutil.copytree(FIXTURES_ROOT / "minimal-project", self.path, dirs_exist_ok=True)

    def cleanup(self) -> None:
        self._tempdir.cleanup()

    def __enter__(self) -> "FixtureWorkspace":
        return self

    def __exit__(self, *args: object) -> None:
        self.cleanup()


def apolo_bin() -> str | None:
    return os.environ.get("APOLO_BIN")


def run_apolo(args: list[str], workspace: Path) -> CliResult:
    binary = apolo_bin()
    if not binary:
        raise RuntimeError("APOLO_BIN is not set")

    completed = subprocess.run(
        [binary, *args],
        cwd=workspace,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return CliResult(
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
