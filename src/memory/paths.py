from __future__ import annotations

from pathlib import Path


def global_memory_dir(home: Path | None = None) -> Path:
    base = home if home is not None else Path.home()
    return base / ".apolo" / "memory"


def global_memory_db(home: Path | None = None) -> Path:
    return global_memory_dir(home) / "memory.sqlite"


def repo_memory_dir(repo_root: Path) -> Path:
    return repo_root / "apolo-memory"


def repo_ledger_dir(repo_root: Path) -> Path:
    return repo_root / ".apolo"


def repo_memory_db(repo_root: Path) -> Path:
    return repo_ledger_dir(repo_root) / "run-ledger.sqlite"
