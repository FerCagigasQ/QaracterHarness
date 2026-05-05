from __future__ import annotations

from pathlib import Path

from .models import RepoScan

DEFAULT_IGNORED_DIRS = (
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
)


def scan_repo(root: Path, ignored_dirs: tuple[str, ...] = DEFAULT_IGNORED_DIRS) -> RepoScan:
    repo_root = root.resolve()
    if not repo_root.exists():
        raise FileNotFoundError(f"Repository path does not exist: {repo_root}")
    if not repo_root.is_dir():
        raise NotADirectoryError(f"Repository path is not a directory: {repo_root}")

    files: list[Path] = []
    for path in sorted(repo_root.rglob("*")):
        relative = path.relative_to(repo_root)
        if _is_ignored(relative, ignored_dirs):
            continue
        if path.is_file():
            files.append(relative)
    return RepoScan(root=repo_root, files=tuple(files), ignored_dirs=ignored_dirs)


def _is_ignored(relative: Path, ignored_dirs: tuple[str, ...]) -> bool:
    return any(part in ignored_dirs for part in relative.parts)
