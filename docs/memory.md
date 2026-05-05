# APOLO memory subsystem

APOLO stores sanitized local memory in two namespaces:

- Global memory: `~/.apolo/memory/memory.sqlite` with rendered notes under `~/.apolo/memory/notes/`.
- Repository memory: `.apolo/run-ledger.sqlite` with versionable notes under `apolo-memory/`.

Only sanitized summaries, decisions, and stable project context should be committed. Do not store credentials, tokens, private keys, customer data, or other sensitive data. The write path runs redaction before persistence and marks records as `redacted`.

The APOLO-CLI 1.0 product contract for portable records is the TypeScript-owned `apolo.memory_record` schema in `src/contracts/schemas.ts`. SQLite and markdown implementations are storage details behind that JSON contract.

## Record types

- `decision`: durable design or product decision. No default expiry.
- `summary`: durable compacted or handoff context. No default expiry.
- `observation`: temporary project note. Default retention: 180 days.
- `run_event`: short-lived execution ledger event. Default retention: 30 days.
- `task`: actionable follow-up. Default retention: 90 days.

## SQLite schema

Migrations live in `migrations/`. The first migration creates:

- `memory_schema_migrations`
- `memory_records`
- `memory_compactions`

`memory_records` stores namespace, type, title, body, tags, metadata, sanitized sensitivity state, markdown path, compaction state, and retention timestamps.

## Markdown notes

Rendered notes are AI-first and start with:

> For future Claude: this note is sanitized memory. Use it as project context, not as a source of secrets or credentials.

The template includes YAML-style metadata, context, and guidance for safe reuse. Repository notes under `apolo-memory/` are intended for non-sensitive summaries and decisions.

## Command internals

The CLI layer can call these internal functions from `src/memory/commands.py`:

- `search_memory(store, query)`
- `list_memory(store, query)`
- `compact_memory(store, query, title)`
- `export_memory(store, query, output_format)`

The functions operate on a `MemoryStore` created with either:

```python
MemoryStore.global_store()
MemoryStore.repo_store(repo_root)
```

## Redaction

The redactor handles common secret-like patterns before SQLite or markdown writes:

- private key blocks
- access-key-shaped identifiers
- JWT-shaped tokens
- authorization headers
- password, token, API key, and secret assignments
- URLs with embedded credentials

Tests use dummy placeholder data only.
