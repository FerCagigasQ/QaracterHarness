from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from src.memory.commands import compact_memory, search_memory
from src.memory.models import MemoryNamespace, MemoryQuery, MemoryRecord, MemoryRecordType
from src.memory.store import MemoryStore


class MemorySearchTest(unittest.TestCase):
    def test_search_filters_by_text_type_and_tag(self) -> None:
        with TemporaryDirectory() as tmp:
            store = MemoryStore.repo_store(Path(tmp))
            store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.DECISION,
                    title="Use SQLite",
                    body="Persist local memory in sqlite for deterministic lookup.",
                    tags=("storage", "mvp"),
                )
            )
            store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.OBSERVATION,
                    title="Markdown rendering",
                    body="Render sanitized AI-first handoff notes.",
                    tags=("notes",),
                )
            )

            result = search_memory(
                store,
                MemoryQuery(
                    namespace=MemoryNamespace.REPO,
                    text="sqlite",
                    record_types=(MemoryRecordType.DECISION,),
                    tags=("storage",),
                ),
            )

            self.assertEqual(1, len(result.records))
            self.assertEqual("Use SQLite", result.records[0].title)

    def test_compact_hides_sources_by_default(self) -> None:
        with TemporaryDirectory() as tmp:
            store = MemoryStore.repo_store(Path(tmp))
            store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.OBSERVATION,
                    title="First observation",
                    body="One safe fact.",
                )
            )
            store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.OBSERVATION,
                    title="Second observation",
                    body="Another safe fact.",
                )
            )

            compacted = compact_memory(
                store,
                MemoryQuery(namespace=MemoryNamespace.REPO, record_types=(MemoryRecordType.OBSERVATION,)),
                "Safe compacted summary",
            )

            self.assertEqual(1, len(compacted.records))
            visible = search_memory(store, MemoryQuery(namespace=MemoryNamespace.REPO, text="observation"))
            self.assertEqual(1, len(visible.records))
            self.assertEqual(MemoryRecordType.SUMMARY, visible.records[0].record_type)
            all_records = search_memory(
                store,
                MemoryQuery(namespace=MemoryNamespace.REPO, text="observation", include_compacted=True),
            )
            self.assertEqual(3, len(all_records.records))


if __name__ == "__main__":
    unittest.main()
