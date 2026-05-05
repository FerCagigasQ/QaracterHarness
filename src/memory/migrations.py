from __future__ import annotations

import sqlite3
from pathlib import Path


MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def apply_migrations(connection: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    applied = {
        row[0]
        for row in connection.execute("SELECT version FROM memory_schema_migrations").fetchall()
    }
    for migration in sorted(migrations_dir.glob("*.sql")):
        version = migration.stem
        if version in applied:
            continue
        connection.executescript(migration.read_text(encoding="utf-8"))
        connection.execute(
            "INSERT INTO memory_schema_migrations(version) VALUES (?)",
            (version,),
        )
    connection.commit()
