from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from src.memory.commands import export_memory
from src.memory.models import MemoryNamespace, MemoryRecord, MemoryRecordType
from src.memory.store import MemoryStore


class MemoryCommandsTest(unittest.TestCase):
    def test_export_memory_uses_same_default_query_for_records_and_markdown(self) -> None:
        with TemporaryDirectory() as tmp:
            store = MemoryStore.repo_store(Path(tmp))
            for index in range(25):
                store.write(
                    MemoryRecord(
                        namespace=MemoryNamespace.REPO,
                        record_type=MemoryRecordType.OBSERVATION,
                        title=f"Export item {index}",
                        body="Safe export body.",
                    )
                )

            result = export_memory(store)

            self.assertEqual(20, len(result.records))
            self.assertIsNotNone(result.output)
            self.assertEqual(20, result.output.count("## Export item"))


if __name__ == "__main__":
    unittest.main()
