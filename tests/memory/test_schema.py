from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from src.memory.models import MemoryNamespace, MemoryRecord, MemoryRecordType
from src.memory.store import MemoryStore


class MemorySchemaTest(unittest.TestCase):
    def test_repo_store_applies_schema_and_retention(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = MemoryStore.repo_store(root)
            stored = store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.RUN_EVENT,
                    title="Dummy run",
                    body="Completed a harmless local operation.",
                )
            )

            self.assertEqual(root / ".apolo" / "run-ledger.sqlite", store.db_path)
            self.assertIsNotNone(stored.expires_at)
            with sqlite3.connect(store.db_path) as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    ).fetchall()
                }
            self.assertIn("memory_records", tables)
            self.assertIn("memory_compactions", tables)


if __name__ == "__main__":
    unittest.main()
