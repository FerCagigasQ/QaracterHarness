# APOLO-CLI 1.0 product contracts

This document is the stable public contract for the TypeScript/Node-only APOLO-CLI 1.0 path.

## Runtime contract

APOLO-CLI 1.0 is an npm-installed CLI:

- Mandatory runtime: Node.js 20+.
- Mandatory implementation path: TypeScript compiled to JavaScript and exposed through the `apolo` npm binary.
- Package manager: npm.
- Python: optional legacy/reference code only. Python must not be required to install, start, or use the product CLI.
- Integration boundary: any optional helper runtime must communicate through explicit JSON artifacts that match these contracts.

The product CLI exposes exactly seven commands:

1. `apolo init`
2. `apolo doctor`
3. `apolo plan`
4. `apolo run`
5. `apolo sync`
6. `apolo memory`
7. `apolo agents`

## Command contracts

All commands accept `--help`. Automation-safe commands should support `--format json`; the default output may remain human-readable text.

| Command | Primary inputs | Stable outputs | Side effects |
| --- | --- | --- | --- |
| `init` | `--workspace <path>`, `--dry-run`, `--format text\|json` | workspace path, created paths, manifest path, approval status | Creates `.apolo/` layout and manifest only after approval or in explicit non-interactive setup mode. |
| `doctor` | `--workspace <path>`, `--format text\|json` | Node/npm runtime diagnostics, workspace/config state, memory paths, agent limit | None. |
| `plan` | `--task <text>`, `--output <path>`, `--workspace <path>`, `--format text\|json` | plan artifact conforming to `apolo.plan` | Writes a plan artifact; no agent execution or repository writes. |
| `run` | `--plan <path>`, `--approve`, `--dry-run`, `--workspace <path>`, `--format text\|json` | run ledger JSONL, verification results, artifacts, exit code | Executes only an approved plan and records ledger events. |
| `sync` | `--dry-run`, `--workspace <path>`, `--format text\|json` | incoming/outgoing changes, applied changes | Synchronizes approved state only. |
| `memory` | `list\|add\|update\|prune\|export`, `--scope global\|repository`, `--from <path>`, `--dry-run`, `--format text\|json` | memory records, redaction summary, changed records | Writes, updates, prunes, or exports memory only after approval. |
| `agents` | `list\|inspect`, `--format text\|json` | agent capabilities, max-agent limit, diagnostics | None. |

No flag may bypass human approval for agent execution, file writes, synchronization, or memory writes.

## Exit codes

| Code | Name | Meaning |
| --- | --- | --- |
| `0` | `success` | Command completed successfully. |
| `1` | `runtimeFailure` | Generic runtime failure. |
| `2` | `invalidUsage` | Invalid command, arguments, or approval missing for non-interactive execution. |
| `64` | `unavailable` | Command contract exists, but the requested implementation or adapter is unavailable. |
| `70` | `environmentFailure` | Dependency or environment readiness check failed. |
| `78` | `invalidConfig` | Configuration or artifact schema validation failed. |
| `130` | `interrupted` | User interrupted the command. |

## Stable schemas

The TypeScript source of truth is `src/contracts/schemas.ts`. Fixtures live under `test/fixtures/contracts/` and are validated by `tests/contracts.test.ts`.

All stable artifacts use:

- `schemaVersion: 1`
- `kind` discriminator
- ISO-8601 timestamps
- JSON objects or JSONL for append-only ledgers
- no company-specific or integration-specific fields in the base schema

### Plan artifact: `apolo.plan`

Produced by `apolo plan` and consumed by `apolo run`.

Required top-level fields:

- `schemaVersion`
- `kind`
- `id`
- `createdAt`
- `command`
- `runtime`
- `task`
- `status`
- `approvalRequired`
- `maxAgents`
- `agents`
- `steps`
- `verification`
- `security`

`status` is one of `draft`, `awaiting_approval`, `approved`, or `rejected`. `maxAgents` must not exceed 5. Every side-effecting step must set `approvalRequired: true`.

### Run ledger event: `apolo.run_event`

Emitted as append-only JSONL by `apolo run`.

Required top-level fields:

- `schemaVersion`
- `kind`
- `runId`
- `eventId`
- `sequence`
- `eventType`
- `timestamp`
- `command`
- `severity`
- `payload`

`sequence` is monotonic within a run. `severity` is one of `debug`, `info`, `warning`, or `error`.

### Memory record: `apolo.memory_record`

Managed by `apolo memory`.

Required top-level fields:

- `schemaVersion`
- `kind`
- `id`
- `namespace`
- `type`
- `title`
- `body`
- `tags`
- `source`
- `createdAt`
- `updatedAt`
- `sensitivity`
- `retention`

`namespace` is `global` or `repository`. `type` is one of `decision`, `summary`, `observation`, `run_event`, or `task`. `body` must be sanitized before persistence.

### Security event: `apolo.security_event`

Emitted before side effects when a security gate evaluates a command or plan.

Required top-level fields:

- `schemaVersion`
- `kind`
- `id`
- `createdAt`
- `command`
- `actor`
- `gate`
- `decision`
- `severity`
- `reason`
- `approvalRequired`
- `metadata`

`decision` is one of `allow`, `block`, or `requires_approval`.

### Agent capability: `apolo.agent_capability`

Visible through `apolo agents`.

Required top-level fields:

- `schemaVersion`
- `kind`
- `id`
- `displayName`
- `provider`
- `adapterType`
- `detection`
- `taskKinds`
- `capabilities`
- `limits`

`adapterType` is one of `local-cli`, `local-model`, or `coordinator`. The registry must reject more than 5 active agents for a task.
