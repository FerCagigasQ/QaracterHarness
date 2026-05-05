CREATE TABLE IF NOT EXISTS memory_records (
    id TEXT PRIMARY KEY,
    namespace TEXT NOT NULL CHECK (namespace IN ('global', 'repo')),
    record_type TEXT NOT NULL CHECK (
        record_type IN ('decision', 'summary', 'observation', 'run_event', 'task')
    ),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT,
    repo_path TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    sensitivity TEXT NOT NULL DEFAULT 'redacted',
    content_hash TEXT NOT NULL,
    markdown_path TEXT,
    is_compacted INTEGER NOT NULL DEFAULT 0 CHECK (is_compacted IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_accessed_at TEXT,
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_records_namespace_type
    ON memory_records(namespace, record_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_records_content_hash
    ON memory_records(namespace, content_hash);

CREATE INDEX IF NOT EXISTS idx_memory_records_expires_at
    ON memory_records(expires_at);

CREATE TABLE IF NOT EXISTS memory_compactions (
    compacted_record_id TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (compacted_record_id, source_record_id),
    FOREIGN KEY (compacted_record_id) REFERENCES memory_records(id),
    FOREIGN KEY (source_record_id) REFERENCES memory_records(id)
);
