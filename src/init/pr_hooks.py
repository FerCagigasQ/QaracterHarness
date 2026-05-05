from __future__ import annotations

from dataclasses import dataclass

from .models import StackDetection, WriteSummary


@dataclass(frozen=True)
class PullRequestHandoff:
    title: str
    body: str
    labels: list[str]
    ready: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "title": self.title,
            "body": self.body,
            "labels": self.labels,
            "ready": self.ready,
        }


def build_pull_request_handoff(detection: StackDetection, summary: WriteSummary) -> PullRequestHandoff:
    changed = summary.creates + summary.updates
    validation = detection.lint_commands + detection.test_commands + detection.build_commands
    body_lines = [
        "## Summary",
        "",
        "- Initialize generic APOLO harness files.",
        "- Add detected project profile, quality gates, memory structure, and handoff documents.",
        "- Preserve existing files through conflict detection before writing.",
        "",
        "## Generated paths",
        "",
        *[f"- `{path}`" for path in changed],
        "",
        "## Validation commands",
        "",
        *([f"- `{command}`" for command in validation] if validation else ["- No commands detected"]),
    ]
    return PullRequestHandoff(
        title="Initialize APOLO repository harness",
        body="\n".join(body_lines),
        labels=["apolo", "init", "harness"],
        ready=not summary.conflicts,
    )
