# APOLO-CLI

APOLO-CLI is a local-first terminal tool for preparing a repository so AI coding agents can work with clearer instructions, safer execution boundaries, persistent memory, and human-approved plans.

It is intentionally simple for day-to-day use:

```bash
apolo init
apolo doctor
apolo plan --task "Implement the feature safely"
apolo run --from-plan .apolo/plans/<plan-id>.md
```

The CLI hides most orchestration details behind sensible defaults: Claude as coordinator, Qwen through Ollama as the default local model, a maximum of 5 agents per task, and mandatory human approval before execution or side effects.

## Current MVP status

This repository contains the APOLO-CLI MVP foundation:

- npm package and global `apolo` binary contract
- TypeScript/Node.js CLI entrypoint, command router, and core runtime foundation
- Python subsystems for optional integration harnesses and legacy implementation seams
- local/global memory schema using SQLite
- generic documentation, examples, packaging checks, and cross-platform CI

The core contract is in place, but the public TypeScript router still exposes some provider workflows as integration seams or stubs. Treat the current package as an MVP foundation, not a fully polished production agent runner.

## Installation

### Global install

```bash
npm install -g apolo-cli
apolo --help
apolo --version
```

### Local development

```bash
npm ci
npm run build
node dist/index.js --help
```

Requirements:

- Node.js 20+
- npm for the primary global install workflow
- Git for repository workflows
- Optional: Python 3.11+ for legacy/fixture harness tests and optional Python-backed integrations
- Optional: Ollama with a Qwen model for local analysis
- Optional: supported agent CLIs installed locally

## Main workflow

### 1. Check your machine

```bash
apolo doctor
```

`doctor` reports the workspace, defaults, memory paths, approval policy, agent limit, and local configuration state.

### 2. Initialize a repository

```bash
apolo init
```

Initialization creates the local APOLO workspace layout and manifest. The broader initialization subsystem is designed to generate reusable harness files such as agent instructions, progress logs, handoff documents, quality checklists, and configuration.

Default workspace layout:

```text
.apolo/
  manifest.json
  plans/
  runs/
  memory/
```

### 3. Plan before execution

```bash
apolo plan --task "Add a safe parser refactor with tests"
```

Planning is read-only by design. A plan should describe scope, risks, files likely to change, agent routing, verification commands, and approval checkpoints.

### 4. Run only after approval

```bash
apolo run --from-plan .apolo/plans/<plan-id>.md
```

Execution must be based on an approved plan. APOLO enforces human approval before non-dry-run execution, file writes, destructive commands, memory writes, synchronization, and PR-related side effects.

## The 7 main commands

| Command | Purpose |
| --- | --- |
| `apolo init` | Prepare a repository with APOLO workspace files and harness artifacts. |
| `apolo doctor` | Check local readiness, config, defaults, memory paths, and policy. |
| `apolo plan` | Create a read-only implementation plan before any execution. |
| `apolo run` | Execute an approved plan through routed agents and verification gates. |
| `apolo sync` | Synchronize approved local state or metadata. |
| `apolo memory` | Inspect and manage local/global memory entries. |
| `apolo agents` | Inspect configured agents, capabilities, and limits. |

## Default policies

| Area | Default |
| --- | --- |
| Install path | npm global package |
| CLI binary | `apolo` |
| Coordinator | Claude |
| Local model | Qwen through Ollama |
| Agent limit | max 5 agents per task |
| Approval mode | human approval always required |
| PR providers | Claude or Codex |
| Memory | SQLite, local-first, global + repository namespaces |
| Supported OS | Windows, macOS, Linux |

## Supported agent adapters

APOLO is designed to detect and route work to locally installed CLIs:

- Claude Code
- Codex CLI
- GitHub Copilot CLI
- OpenCode
- Gemini CLI
- Cursor CLI
- Ollama with Qwen by default

Claude is the default coordinator. Codex and Claude are the intended PR-capable providers in the MVP. Other agents can support specialized local tasks depending on availability and capability.

## Documentation

- [Detailed usage guide](docs/USAGE.md)
- [System internals](docs/SYSTEM.md)
- [Command reference](docs/command-reference.md)
- [Usage guide](docs/usage.md)
- [Architecture overview](docs/architecture.md)
- [Agent adapters](docs/adapters.md)
- [Initialization workflow](docs/init.md)
- [Memory subsystem](docs/memory.md)
- [Security gates](docs/security.md)
- [Run workflow](docs/run.md)
- [Packaging and release validation](docs/packaging.md)
- [Cross-platform notes](docs/cross-platform.md)
- [Test strategy](docs/test-strategy.md)
- [Examples](docs/examples.md)

## Repository layout

```text
docs/                 User docs, architecture, command reference, QA strategy
examples/             Copyable generic configuration examples
packaging/            npm packaging and binary smoke validation
src/cli/              TypeScript CLI entrypoint, routing, logging, errors
src/config/           Defaults, config loading, manifest model
src/fs/               Filesystem layout helpers
src/init/             Python repository scanner and harness generator
src/agents/           Agent capability model, detection, adapters, execution
src/memory/           SQLite memory store, markdown export, redaction
src/security/         Policy gates and sensitive data checks
src/run/              Approved-plan execution orchestration
src/verification/     Verification command detection and execution
src/git/              Branch and PR draft helpers
test/                 CLI, integration, fixture, and harness tests
```

## Local validation

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:python
npm run package:check
npm run smoke:bin
```

Full CI command:

```bash
npm run ci
```

`npm run smoke:bin` packs the project, installs it into a temporary global prefix, and validates that the `apolo` binary starts correctly on the current platform.

## Design principles

- Keep the CLI simple: `init -> doctor -> plan -> run`.
- Make repository context explicit and reusable.
- Prefer read-only planning before execution.
- Require human approval before side effects.
- Limit parallelism to avoid drift.
- Store reusable memory locally, with redaction before write.
- Verify work with runnable commands, not optimistic claims.
- Keep provider adapters replaceable.
