from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from src.memory.models import MemoryNamespace, MemoryRecord, MemoryRecordType
from src.memory.redaction import redact_text
from src.memory.store import MemoryStore


class MemoryRedactionTest(unittest.TestCase):
    def test_redacts_dummy_secret_like_assignments(self) -> None:
        result = redact_text("api_key=dummyplaceholder123 password='placeholderpass123'")

        self.assertTrue(result.changed)
        self.assertIn("api_key=[REDACTED_SECRET]", result.text)
        self.assertIn("password=[REDACTED_SECRET]", result.text)
        self.assertNotIn("dummyplaceholder123", result.text)
        self.assertNotIn("placeholderpass123", result.text)

    def test_store_redacts_before_sqlite_and_markdown_write(self) -> None:
        with TemporaryDirectory() as tmp:
            store = MemoryStore.repo_store(Path(tmp))
            stored = store.write(
                MemoryRecord(
                    namespace=MemoryNamespace.REPO,
                    record_type=MemoryRecordType.DECISION,
                    title="Credential policy",
                    body="token=dummyplaceholdertoken123 must not be persisted.",
                    tags=("secret=dummyplaceholdertag123",),
                    metadata={
                        "api_key": "dummyplaceholdermeta123",
                        "note": "plain metadata value",
                    },
                )
            )

            loaded = store.get(stored.id or "")
            self.assertIsNotNone(loaded)
            self.assertIn("[REDACTED_SECRET]", loaded.body)
            self.assertNotIn("dummyplaceholdertoken123", loaded.body)
            self.assertEqual(("[REDACTED_SECRET]",), loaded.tags)
            self.assertEqual("[REDACTED_SECRET]", loaded.metadata["api_key"])
            self.assertEqual("plain metadata value", loaded.metadata["note"])
            self.assertEqual(stored.metadata, loaded.metadata)
            self.assertGreaterEqual(loaded.metadata["redaction_count"], 3)
            self.assertIsNotNone(stored.markdown_path)
            markdown = stored.markdown_path.read_text(encoding="utf-8")
            self.assertIn("[REDACTED_SECRET]", markdown)
            self.assertNotIn("dummyplaceholdertoken123", markdown)
            self.assertNotIn("dummyplaceholdertag123", markdown)


if __name__ == "__main__":
    unittest.main()
