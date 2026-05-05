from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RepoScan:
    root: Path
    files: tuple[Path, ...]
    ignored_dirs: tuple[str, ...]

    def has(self, pattern: str) -> bool:
        return any(path.match(pattern) for path in self.files)

    def has_any(self, *patterns: str) -> bool:
        return any(self.has(pattern) for pattern in patterns)

    def has_prefix(self, prefix: str) -> bool:
        return any(path.as_posix().startswith(prefix) for path in self.files)

    def read_text(self, relative_path: str) -> str:
        target = self.root / relative_path
        if not target.is_file():
            return ""
        try:
            return target.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return target.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""


@dataclass(frozen=True)
class StackDetection:
    languages: list[str]
    frameworks: list[str]
    package_managers: list[str]
    test_commands: list[str]
    lint_commands: list[str]
    build_commands: list[str]
    ci_providers: list[str]
    tests_present: bool
    minimal_test_kind: str

    def to_dict(self) -> dict[str, object]:
        return {
            "languages": self.languages,
            "frameworks": self.frameworks,
            "package_managers": self.package_managers,
            "test_commands": self.test_commands,
            "lint_commands": self.lint_commands,
            "build_commands": self.build_commands,
            "ci_providers": self.ci_providers,
            "tests_present": self.tests_present,
            "minimal_test_kind": self.minimal_test_kind,
        }


@dataclass(frozen=True)
class GeneratedFile:
    relative_path: str
    content: str
    executable: bool = False


@dataclass(frozen=True)
class WritePlan:
    repo_root: Path
    files: list[GeneratedFile]
    marker: str


@dataclass(frozen=True)
class WriteSummary:
    creates: list[str]
    updates: list[str]
    skips: list[str]
    conflicts: list[str]
    diff: str

    def to_dict(self) -> dict[str, object]:
        return {
            "creates": self.creates,
            "updates": self.updates,
            "skips": self.skips,
            "conflicts": self.conflicts,
            "diff": self.diff,
        }
