from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from .models import StackDetection


@dataclass(frozen=True)
class HandoffSummary:
    branch: str | None
    has_uncommitted_changes: bool
    suggested_pr_title: str
    suggested_pr_body: str
    validation_commands: list[str]

    def to_dict(self) -> dict[str, object]:
        return {
            "branch": self.branch,
            "has_uncommitted_changes": self.has_uncommitted_changes,
            "suggested_pr_title": self.suggested_pr_title,
            "suggested_pr_body": self.suggested_pr_body,
            "validation_commands": self.validation_commands,
        }

    def to_markdown(self) -> str:
        commands = "\n".join(f"- `{command}`" for command in self.validation_commands) or "- Not detected"
        branch = self.branch or "unknown"
        dirty = "yes" if self.has_uncommitted_changes else "no"
        return (
            f"- Branch: `{branch}`\n"
            f"- Uncommitted changes: {dirty}\n"
            f"- Suggested PR title: {self.suggested_pr_title}\n"
            f"- Validation commands:\n{commands}"
        )


def build_handoff_summary(repo_root: Path, detection: StackDetection) -> HandoffSummary:
    validation_commands = detection.lint_commands + detection.test_commands + detection.build_commands
    return HandoffSummary(
        branch=_git_output(repo_root, ["branch", "--show-current"]) or None,
        has_uncommitted_changes=bool(_git_output(repo_root, ["status", "--porcelain"])),
        suggested_pr_title="Initialize APOLO repository harness",
        suggested_pr_body=(
            "Adds generic APOLO harness files, detected project profile, quality gates, "
            "memory structure, and initialization handoff artifacts."
        ),
        validation_commands=validation_commands,
    )


def _git_output(repo_root: Path, args: list[str]) -> str:
    if not (repo_root / ".git").exists():
        return ""
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_root), *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()
