from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

from .markdown import render_memory_note
from .migrations import apply_migrations
from .models import (
    MemoryNamespace,
    MemoryQuery,
    MemoryRecord,
    MemoryRecordType,
    RetentionPolicy,
    from_iso,
    to_iso,
    utc_now,
)
from .paths import global_memory_db, global_memory_dir, repo_memory_db, repo_memory_dir
from .redaction import redact_text


class MemoryStore:
    def __init__(
        self,
        db_path: Path,
        namespace: MemoryNamespace,
        markdown_dir: Path | None = None,
    ) -> None:
        self.db_path = db_path
        self.namespace = namespace
        self.markdown_dir = markdown_dir

    @classmethod
    def global_store(cls, home: Path | None = None) -> "MemoryStore":
        return cls(global_memory_db(home), MemoryNamespace.GLOBAL, global_memory_dir(home) / "notes")

    @classmethod
    def repo_store(cls, repo_root: Path) -> "MemoryStore":
        return cls(repo_memory_db(repo_root), MemoryNamespace.REPO, repo_memory_dir(repo_root))

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            apply_migrations(connection)

    def write(self, record: MemoryRecord, persist_markdown: bool | None = None) -> MemoryRecord:
        now = utc_now()
        record_id = record.id or str(uuid.uuid4())
        title_redaction = redact_text(record.title)
        body_redaction = redact_text(record.body)
        source_redaction = redact_text(record.source or "")
        tag_redactions = tuple(redact_text(tag) for tag in record.tags)
        metadata, metadata_redaction_count = self._redact_metadata(record.metadata)
        metadata = {
            **metadata,
            "redaction_count": len(title_redaction.findings)
            + len(body_redaction.findings)
            + len(source_redaction.findings)
            + sum(len(redaction.findings) for redaction in tag_redactions)
            + metadata_redaction_count,
        }
        created_at = record.created_at or now
        updated_at = now
        expires_at = record.expires_at
        if expires_at is None:
            days = RetentionPolicy.DEFAULT_DAYS[record.record_type]
            expires_at = created_at + timedelta(days=days) if days is not None else None
        sanitized = replace(
            record,
            id=record_id,
            namespace=self.namespace,
            title=title_redaction.text,
            body=body_redaction.text,
            source=source_redaction.text or None,
            tags=tuple(redaction.text for redaction in tag_redactions),
            metadata=metadata,
            sensitivity="redacted",
            created_at=created_at,
            updated_at=updated_at,
            expires_at=expires_at,
        )
        markdown_path = self._write_markdown_if_needed(sanitized, persist_markdown)
        sanitized = replace(sanitized, markdown_path=markdown_path)
        self.initialize()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO memory_records (
                    id, namespace, record_type, title, body, source, repo_path, tags_json,
                    metadata_json, sensitivity, content_hash, markdown_path, is_compacted,
                    created_at, updated_at, last_accessed_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    body = excluded.body,
                    source = excluded.source,
                    tags_json = excluded.tags_json,
                    metadata_json = excluded.metadata_json,
                    sensitivity = excluded.sensitivity,
                    content_hash = excluded.content_hash,
                    markdown_path = excluded.markdown_path,
                    is_compacted = excluded.is_compacted,
                    updated_at = excluded.updated_at,
                    expires_at = excluded.expires_at
                """,
                (
                    sanitized.id,
                    sanitized.namespace.value,
                    sanitized.record_type.value,
                    sanitized.title,
                    sanitized.body,
                    sanitized.source,
                    str(sanitized.repo_path) if sanitized.repo_path else None,
                    json.dumps(list(sanitized.tags), sort_keys=True),
                    json.dumps(
                        metadata,
                        sort_keys=True,
                    ),
                    sanitized.sensitivity,
                    self._content_hash(sanitized),
                    str(sanitized.markdown_path) if sanitized.markdown_path else None,
                    1 if sanitized.is_compacted else 0,
                    to_iso(sanitized.created_at),
                    to_iso(sanitized.updated_at),
                    to_iso(sanitized.last_accessed_at),
                    to_iso(sanitized.expires_at),
                ),
            )
            connection.commit()
        return sanitized

    def get(self, record_id: str) -> MemoryRecord | None:
        self.initialize()
        now = to_iso(utc_now())
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM memory_records WHERE id = ?",
                (record_id,),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                "UPDATE memory_records SET last_accessed_at = ? WHERE id = ?",
                (now, record_id),
            )
            connection.commit()
        return self._row_to_record(row)

    def list(self, query: MemoryQuery | None = None) -> list[MemoryRecord]:
        query = query or MemoryQuery(namespace=self.namespace)
        return self._query(query)

    def search(self, query: MemoryQuery) -> list[MemoryRecord]:
        if query.text is None or not query.text.strip():
            return self.list(query)
        return self._query(query)

    def compact(self, query: MemoryQuery, title: str = "Compacted memory") -> MemoryRecord | None:
        source_records = self._query(query)
        if not source_records:
            return None
        body = "\n".join(
            f"- {record.record_type.value}: {record.title}\n  {record.body[:400]}"
            for record in source_records
        )
        compacted = self.write(
            MemoryRecord(
                namespace=self.namespace,
                record_type=MemoryRecordType.SUMMARY,
                title=title,
                body=body,
                tags=("compacted",),
            ),
            persist_markdown=True,
        )
        with self._connect() as connection:
            for record in source_records:
                connection.execute(
                    "UPDATE memory_records SET is_compacted = 1 WHERE id = ?",
                    (record.id,),
                )
                connection.execute(
                    """
                    INSERT OR IGNORE INTO memory_compactions(compacted_record_id, source_record_id)
                    VALUES (?, ?)
                    """,
                    (compacted.id, record.id),
                )
            connection.commit()
        return compacted

    def export_markdown(self, query: MemoryQuery | None = None) -> str:
        from .markdown import render_export

        return render_export(self._query(query or MemoryQuery(namespace=self.namespace, limit=1000)))

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _query(self, query: MemoryQuery) -> list[MemoryRecord]:
        self.initialize()
        clauses = []
        parameters: list[str | int] = []
        namespace = query.namespace or self.namespace
        clauses.append("namespace = ?")
        parameters.append(namespace.value)
        if query.record_types:
            placeholders = ", ".join("?" for _ in query.record_types)
            clauses.append(f"record_type IN ({placeholders})")
            parameters.extend(record_type.value for record_type in query.record_types)
        if not query.include_compacted:
            clauses.append("is_compacted = 0")
        if query.text and query.text.strip():
            clauses.append("(lower(title) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\')")
            escaped = query.text.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            needle = f"%{escaped}%"
            parameters.extend([needle, needle])
        for tag in query.tags:
            clauses.append("tags_json LIKE ?")
            parameters.append(f'%"{tag}"%')
        parameters.append(query.limit)
        sql = f"""
            SELECT * FROM memory_records
            WHERE {" AND ".join(clauses)}
            ORDER BY created_at DESC
            LIMIT ?
        """
        with self._connect() as connection:
            rows = connection.execute(sql, parameters).fetchall()
        return [self._row_to_record(row) for row in rows]

    def _write_markdown_if_needed(
        self,
        record: MemoryRecord,
        persist_markdown: bool | None,
    ) -> Path | None:
        should_persist = persist_markdown
        if should_persist is None:
            should_persist = record.record_type in {
                MemoryRecordType.DECISION,
                MemoryRecordType.SUMMARY,
            }
        if not should_persist or self.markdown_dir is None:
            return None
        note_dir = self.markdown_dir / record.record_type.value
        note_dir.mkdir(parents=True, exist_ok=True)
        path = note_dir / f"{_slug(record.title)}-{record.id[:8]}.md"
        path.write_text(render_memory_note(record), encoding="utf-8")
        return path

    def _row_to_record(self, row: sqlite3.Row) -> MemoryRecord:
        return MemoryRecord(
            id=row["id"],
            namespace=MemoryNamespace(row["namespace"]),
            record_type=MemoryRecordType(row["record_type"]),
            title=row["title"],
            body=row["body"],
            source=row["source"],
            repo_path=Path(row["repo_path"]) if row["repo_path"] else None,
            tags=tuple(json.loads(row["tags_json"])),
            metadata=json.loads(row["metadata_json"]),
            sensitivity=row["sensitivity"],
            created_at=from_iso(row["created_at"]),
            updated_at=from_iso(row["updated_at"]),
            last_accessed_at=from_iso(row["last_accessed_at"]),
            expires_at=from_iso(row["expires_at"]),
            is_compacted=bool(row["is_compacted"]),
            markdown_path=Path(row["markdown_path"]) if row["markdown_path"] else None,
        )

    @staticmethod
    def _content_hash(record: MemoryRecord) -> str:
        payload = "\n".join(
            [
                record.namespace.value,
                record.record_type.value,
                record.title,
                record.body,
                "\0".join(record.tags),
            ]
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def _redact_metadata(
        metadata: object,
    ) -> tuple[dict[str, str | int | float | bool | None], int]:
        redacted: dict[str, str | int | float | bool | None] = {}
        findings = 0
        if not isinstance(metadata, dict):
            return redacted, findings
        for key, value in metadata.items():
            key_text = redact_text(str(key))
            findings += len(key_text.findings)
            if isinstance(value, str):
                value_text = redact_text(value)
                redacted[key_text.text] = value_text.text
                findings += len(value_text.findings)
            elif isinstance(value, (int, float, bool)) or value is None:
                redacted[key_text.text] = value
            else:
                value_text = redact_text(json.dumps(value, sort_keys=True))
                redacted[key_text.text] = value_text.text
                findings += len(value_text.findings)
        return redacted, findings


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized[:64] or "memory"
