# APOLO memory subsystem

APOLO stores sanitized local memory in two namespaces:

- Global memory: `~/.apolo/memory/global.jsonl` for the TypeScript npm runtime.
- Repository memory: `.apolo/memory/repo.jsonl` for the TypeScript npm runtime.
- Python-era SQLite stores are still present in the repository for migration/reference, but Python is not required to run the APOLO npm CLI.

Only sanitized summaries, decisions, and stable project context should be committed. Do not store credentials, tokens, private keys, customer data, or other sensitive data. The write path runs redaction before persistence and marks records as `redacted`.

The APOLO-CLI 1.0 product contract for portable records is the TypeScript-owned `apolo.memory_record` schema in `src/contracts/schemas.ts`. SQLite and markdown implementations are storage details behind that JSON contract.

## Record types

- `decision`: durable design or product decision. No default expiry.
- `summary`: durable compacted or handoff context. No default expiry.
- `observation`: temporary project note. Default retention: 180 days.
- `run_event`: short-lived execution ledger event. Default retention: 30 days.
- `task`: actionable follow-up. Default retention: 90 days.

## Storage

The TypeScript CLI uses a safe JSONL store with a narrow `MemoryStore` abstraction so the package avoids native SQLite install risk. The next step is to add an optional SQLite-backed implementation behind the same interface if the package can adopt a cross-platform dependency safely.

Historical SQLite migrations live in `migrations/`. The first migration creates:

- `memory_schema_migrations`
- `memory_records`
- `memory_compactions`

`memory_records` stores namespace, type, title, body, tags, metadata, sanitized sensitivity state, markdown path, compaction state, and retention timestamps.

## Markdown notes

Rendered notes are AI-first and start with:

> For future Claude: this note is sanitized memory. Use it as project context, not as a source of secrets or credentials.

The template includes YAML-style metadata, context, and guidance for safe reuse. Repository notes under `apolo-memory/` are intended for non-sensitive summaries and decisions.

## CLI commands

The npm CLI exposes:

- `apolo memory list`
- `apolo memory search <query>`
- `apolo memory show <id>`
- `apolo memory add --title <title> --body <body> [--type decision|summary|observation|run_event|task] [--tag <tag>]`
- `apolo memory export [--format markdown|json]`

## Redaction

The redactor handles common secret-like patterns before JSONL or markdown writes:

- private key blocks
- access-key-shaped identifiers
- JWT-shaped tokens
- authorization headers
- password, token, API key, and secret assignments
- URLs with embedded credentials

Tests use dummy placeholder data only.
