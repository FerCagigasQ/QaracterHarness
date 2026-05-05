# Architecture overview

APOLO CLI is designed as a small terminal entrypoint with explicit boundaries between orchestration, model adapters, approval policy, memory, and synchronization.

For a more complete explanation of the internal system, see [`SYSTEM.md`](SYSTEM.md).

## High-level components

```text
Terminal
  |
  v
apolo CLI command router
  |
  +-- workspace/config loader
  +-- approval policy gate
  +-- planning coordinator adapter
  +-- local model adapter
  +-- agent registry
  +-- memory store
  +-- sync adapter
  +-- execution runner
```

## Runtime responsibilities

| Component | Responsibility |
| --- | --- |
| Command router | Parse `apolo <command>` arguments, load config, choose output format, and dispatch work. |
| Workspace/config loader | Resolve `.apolo/`, `apolo.config.json`, current repo metadata, and safe default paths. |
| Approval policy gate | Require human confirmation before agent execution, file modification, network sync, or shell side effects. |
| Planning coordinator adapter | Use Claude as the default planner/coordinator while keeping adapter boundaries replaceable. |
| Local model adapter | Use Qwen through Ollama as the default local model path for local analysis and fallback workflows. |
| Agent registry | Track configured agents, capabilities, status, and the MVP limit of 5 agents. |
| Memory store | Store user-approved local notes, task summaries, decisions, and reusable context. |
| Sync adapter | Synchronize approved state with a remote endpoint or local mirror without bypassing approval policy. |
| Execution runner | Execute approved plans, stream logs, capture artifacts, and return deterministic exit codes. |

## Harness model

APOLO organizes reliable agent work around five subsystems:

| Subsystem | APOLO responsibility |
| --- | --- |
| Instructions | Generate and maintain concise agent-readable instructions, startup commands, and quality rules. |
| State | Persist plans, run ledgers, handoffs, progress, and memory so sessions are resumable. |
| Verification | Detect and run repository checks, then record evidence instead of relying on optimistic summaries. |
| Scope | Limit work to an approved plan, max 5 agents, explicit write scopes, and bounded diffs. |
| Session lifecycle | Start from known state, request approval, execute, verify, record memory, and leave clean handoff state. |

## TypeScript/Node product boundary

The 1.0 product path keeps the public CLI surface and mandatory runtime in TypeScript/Node.js so npm global installation works consistently. Python code in this repository is optional legacy/reference material and must not be required to install, start, or use the product CLI.

The boundary is:

1. TypeScript owns argument parsing, command UX, config loading, package bin wiring, product contracts, and stable schemas.
2. Product artifacts are explicit JSON or JSONL objects validated against versioned schemas.
3. Optional helper runtimes may only sit behind stable JSON contracts and must not silently mutate the workspace.
4. No helper runtime may bypass a TypeScript-layer approval record.

## Approval model

Human approval is always required before:

- starting or resuming agent execution
- modifying files
- running shell commands with side effects
- syncing state outside the local workspace
- adding, deleting, or rewriting memory entries

Dry-run commands may inspect local fixtures and print proposed actions, but they must not execute plans.

## Agent limit

The MVP supports a maximum of 5 configured agents. The agent registry should reject configs above this limit before planning or execution begins.

## Storage layout

Recommended default workspace paths:

```text
.apolo/
  config.json
  agents/
  memory/
  plans/
  runs/
  sync/
```

All paths should be overridable for tests through command flags or environment variables.

## Workstream module map

The MVP implementation is split across focused modules:

| Area | Main paths |
| --- | --- |
| CLI core | `src/cli/`, `src/config/`, `src/fs/`, `src/index.ts` |
| Product contracts | `src/contracts/`, `docs/product-contracts.md`, `test/fixtures/contracts/` |
| Planning | `src/plan/` integration seam, `.apolo/plans/` artifacts |
| Agent adapters and routing | `src/agents/`, `src/routing/` |
| Repository initialization | `src/init/`, `src/templates/` |
| Memory | `src/memory/`, `migrations/001_memory_schema.sql` |
| Security | `src/security/`, `src/policy/` |
| Run and verification | `src/run/`, `src/verification/`, `src/git/` |
| QA and packaging | `tests/`, `test/`, `packaging/`, `.github/workflows/` |

## Interface contracts

Subsystems communicate through narrow contracts rather than direct provider coupling:

- command specs for agent subprocess invocation
- plan artifacts for plan-to-run handoff
- policy requests for security gate evaluation
- verification result objects for checks
- memory records for durable context
- PR draft objects for provider-specific PR submission

This allows the CLI to stay simple while provider implementations evolve behind stable boundaries.
