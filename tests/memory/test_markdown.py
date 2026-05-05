from __future__ import annotations

import unittest
from src.memory.markdown import FOR_FUTURE_CLAUDE, render_memory_note
from src.memory.models import MemoryNamespace, MemoryRecord, MemoryRecordType


class MemoryMarkdownTest(unittest.TestCase):
    def test_renders_ai_first_sanitized_note(self) -> None:
        markdown = render_memory_note(
            MemoryRecord(
                id="mem-1",
                namespace=MemoryNamespace.REPO,
                record_type=MemoryRecordType.SUMMARY,
                title="Safe handoff",
                body="Use markdown for summaries. secret=dummyplaceholder123",
                tags=("handoff",),
            )
        )

        self.assertIn(FOR_FUTURE_CLAUDE, markdown)
        self.assertIn("type: summary", markdown)
        self.assertIn("namespace: repo", markdown)
        self.assertIn("# Safe handoff", markdown)
        self.assertIn("[REDACTED_SECRET]", markdown)
        self.assertNotIn("dummyplaceholder123", markdown)


if __name__ == "__main__":
    unittest.main()
