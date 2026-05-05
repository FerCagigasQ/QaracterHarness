from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from .models import MemoryRecord, to_iso
from .redaction import redact_text

FOR_FUTURE_CLAUDE = (
    "For future Claude: this note is sanitized memory. Use it as project context, "
    "not as a source of secrets or credentials."
)


def render_memory_note(record: MemoryRecord) -> str:
    title = redact_text(record.title).text
    body = redact_text(record.body).text
    tags = ", ".join(record.tags) if record.tags else "none"
    lines = [
        "---",
        f"id: {record.id or ''}",
        f"type: {record.record_type.value}",
        f"namespace: {record.namespace.value}",
        f"created_at: {_render_date(record.created_at)}",
        f"updated_at: {_render_date(record.updated_at)}",
        f"tags: {tags}",
        "sensitivity: redacted",
        "---",
        "",
        FOR_FUTURE_CLAUDE,
        "",
        f"# {title}",
        "",
        "## Context",
        body.strip() or "_No details recorded._",
        "",
        "## How to use",
        "- Prefer this note for summaries, decisions, and stable context.",
        "- Do not infer or reconstruct secrets from placeholders.",
        "- Verify time-sensitive facts before acting on them.",
        "",
    ]
    return "\n".join(lines)


def render_export(records: Iterable[MemoryRecord]) -> str:
    rendered = ["# APOLO Memory Export", "", FOR_FUTURE_CLAUDE, ""]
    for record in records:
        rendered.extend(
            [
                f"## {redact_text(record.title).text}",
                "",
                f"- Type: `{record.record_type.value}`",
                f"- Namespace: `{record.namespace.value}`",
                f"- Created: `{_render_date(record.created_at)}`",
                "",
                redact_text(record.body).text.strip() or "_No details recorded._",
                "",
            ]
        )
    return "\n".join(rendered)


def _render_date(value: datetime | None) -> str:
    return to_iso(value) or ""
