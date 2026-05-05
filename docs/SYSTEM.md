# APOLO-CLI system internals

This document explains how APOLO-CLI is designed internally: the main subsystems, how they interact, where state is stored, and how execution is kept safe.

## System overview

APOLO is a local terminal orchestrator. It does not replace coding agents. It prepares the repository, builds a plan, routes work to available agents, records memory, and enforces approval/security gates around side effects.

```text
User terminal
  |
  v
apolo CLI router
  |
  +-- config and workspace loader
  +-- repository initialization
  +-- planning coordinator
  +-- approval and security gates
  +-- agent registry and router
  +-- execution orchestrator
  +-- verification runner
  +-- memory store
  +-- sync and PR workflow seams
```

The public CLI is intentionally small. Complex behavior lives behind defaults and subsystem boundaries.

## The 5 harness subsystems

APOLO applies a harness model with five core subsystems.

### 1. Instructions

Instruction artifacts tell agents how to work in a repository:

- what the project is
- how to install dependencies
- how to run checks
- what rules are mandatory
- what files represent current state
- what must be verified before claiming completion

The initialization subsystem can generate files such as:

- `AGENTS.md`
- `CLAUDE.md`
- `.apolo/apolo-progress.md`
- `.apolo/session-handoff.md`
- `.apolo/quality-document.md`
- `.apolo/gates.yaml`
- `.apolo/apolo.yaml`
- `init.sh`

The pattern is progressive disclosure: keep the root instructions short and link to focused files instead of creating one huge instruction document.

### 2. State

State makes long-running work resumable. APOLO uses local workspace files, run ledgers, plans, and memory records so a new session can understand:

- what was planned
- what was approved
- what ran
- what changed
- what verification passed or failed
- what remains blocked

Default workspace state lives under `.apolo/`.

### 3. Verification

APOLO treats verification as a first-class step. The verification subsystem detects common commands from the repository:

- Node: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`
- Python: `python -m unittest discover`
- Make: `make lint`, `make typecheck`, `make build`, `make test`

Verification results are structured. A failed command should be reported as evidence, not hidden behind a successful-looking summary.

### 4. Scope

APOLO limits execution scope to reduce drift:

- maximum 5 agents per task
- one approved plan per run
- explicit task decomposition during planning
- write-scope and diff-size security gates
- PR-oriented workflow for repository changes

The planner should choose the smallest useful agent set. More agents are not automatically better.

### 5. Session lifecycle

Each run follows a lifecycle:

1. Load workspace and approved plan.
2. Check security policy.
3. Route work to logical agents.
4. Request human approval.
5. Prepare branch metadata.
6. Execute or dry-run.
7. Run verification.
8. Record memory and ledger events.
9. Prepare PR draft metadata.
10. Leave resumable state.

The run ledger records lifecycle events so execution can be audited later.

## TypeScript runtime and optional Python split

APOLO uses TypeScript/Node.js for the public CLI and core runtime. Python-backed helpers are optional integration seams, not a requirement for npm-global installation or TypeScript-owned commands.

### TypeScript owns

- global npm binary
- CLI entrypoint
- command routing
- user-facing help
- config loading
- filesystem layout helpers
- manifest defaults
- command service boundaries
- structured errors and JSON/text output
- timeout and cancellation helpers
- reusable command result contracts
- package validation

Key paths:

```text
src/index.ts
src/cli/
src/config/
src/fs/
```

### Python owns

- repository scanning
- harness generation
- agent adapter definitions
- security gate engine
- SQLite memory store
- run orchestration seams
- verification command detection
- Git/PR metadata helpers

Key paths:

```text
src/init/
src/agents/
src/security/
src/memory/
src/run/
src/verification/
src/git/
```

The boundary should stay explicit: Python helpers should receive structured input and return structured output. The TypeScript layer should remain the stable user interface.

## Workspace and global layout

APOLO has two state scopes.

### Repository scope

Repository state lives in the current project:

```text
.apolo/
  manifest.json
  apolo.yaml
  gates.yaml
  plans/
  runs/
  memory/
  sync/
```

This scope is for project-specific instructions, plans, run logs, repo memory, and generated harness files.

### Global scope

Global state lives under `~/.apolo/` by default:

```text
~/.apolo/
  memory/
  agents/
  config/
```

Set `APOLO_HOME` to override the global location, especially in tests or isolated environments.

## Memory system

The memory subsystem is local-first and SQLite-backed.

Default namespaces:

- global memory: reusable knowledge across repositories
- repository memory: project-specific context and decisions

Memory records can store:

- decisions
- task summaries
- reusable patterns
- errors and fixes
- verification evidence
- agent handoff context

Before writing memory, APOLO applies sensitive-data detection and redaction. Secrets, credentials, private keys, and token-like values should be blocked or redacted instead of stored.

Memory can also be exported as AI-first markdown so future agents can retrieve context quickly.

## Agent system

APOLO models agents through adapters and capabilities.

Supported adapter targets:

- Claude Code
- Codex CLI
- GitHub Copilot CLI
- OpenCode
- Gemini CLI
- Cursor CLI
- Ollama Qwen

Each adapter declares:

- ID and display name
- executable candidates
- supported task kinds
- whether it can coordinate
- whether it can open PRs
- whether it supports local execution
- command invocation shape

The registry enforces the MVP maximum of 5 agents per task.

## Planning model

Planning should be read-only. A plan should include:

- task summary
- assumptions
- target files or areas
- excluded scope
- proposed agents
- parallelization strategy
- security risks
- verification commands
- rollback notes
- approval checkpoints

The expected flow is:

```text
apolo plan -> user reviews plan -> user approves -> apolo run --from-plan
```

Execution without an approved plan should be rejected.

## Run orchestration

The run orchestrator coordinates approved execution through small interfaces:

- `PlanStore`
- `SecurityPolicy`
- `ApprovalGateway`
- `AgentRouter`
- `AgentExecutor`
- `VerificationRunner`
- `MemoryStore`
- `GitWorkflow`
- `InitHooks`

This keeps provider-specific details out of the orchestration core.

Run states include:

- approval required
- rejected
- running
- completed
- failed

Dry runs exercise routing and policy without performing agent side effects.

## Security gates

The security gate engine checks a planned or requested operation before it runs.

Gate categories include:

- human approval
- secret detection
- destructive operations
- tool allowlist
- write scope
- memory writes
- budget usage
- diff size
- permissions

Default policy is conservative: approval is required before execution, file writes, destructive operations, memory writes, synchronization, and external side effects.

## PR workflow

APOLO is PR-oriented for repository modifications:

1. plan the task
2. obtain approval
3. prepare branch metadata
4. execute work
5. run verification
6. prepare PR draft content

The MVP restricts PR-capable providers to Claude and Codex. PR draft metadata includes summary, approval, and verification sections.

## Sync model

Sync is designed as an approval-gated state exchange. It should never silently upload local memory, run artifacts, or project metadata. A dry run should show incoming and outgoing changes before anything is applied.

## Failure handling

APOLO should fail closed:

- unapproved plan: do not run
- secret detected: block write
- destructive command without approval: block
- too many agents: reject config
- verification timeout: record failed result
- unsupported provider: report capability gap
- invalid config: return a deterministic exit code

The goal is not to pretend work succeeded. The goal is to preserve evidence so the user can decide the next action.
