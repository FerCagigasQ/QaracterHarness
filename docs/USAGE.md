# APOLO-CLI detailed usage guide

This guide explains how to install APOLO-CLI, initialize a repository, create plans, run approved work, manage memory, and inspect agents.

## Requirements

Minimum:

- Node.js 20+
- npm
- Git

Recommended:

- Python 3.11+ only for Python target-repository verification, source-checkout fixture tests, or future optional plugins
- Ollama for local Qwen workflows
- at least one supported coding-agent CLI installed locally

Supported operating systems:

- Windows
- macOS
- Linux

## Install

### Global npm install

```bash
npm install -g apolo-cli
apolo --version
apolo --help
```

### From a local checkout

```bash
npm ci
npm run build
node dist/index.js --help
```

### Optional local model setup

Install Ollama and pull a Qwen coding model:

```bash
ollama pull qwen2.5-coder:latest
ollama list
```

APOLO defaults to Qwen through Ollama for local fallback and local analysis workflows.

The installed APOLO 1.0 runtime is TypeScript/Node.js-only. Installing and running `apolo` from npm does not require Python.

## First-time global workflow

Use this when setting up a machine:

```bash
apolo doctor
apolo sync --dry-run
```

`doctor` checks local readiness. `sync --dry-run` previews synchronization without applying changes.

## First-time repository workflow

From a repository root:

```bash
apolo init
apolo doctor
```

Initialization prepares `.apolo/` state and default configuration. In the full workflow, generated harness changes should be reviewed through a PR instead of silently pushed to the default branch.

## Daily workflow

```bash
apolo doctor
apolo plan --task "Describe the change you want"
# review the generated plan
apolo run --from-plan .apolo/plans/<plan-id>.md
```

The important rule is simple: plan first, approve second, run last.

## Command reference

### `apolo init`

Prepare a repository for APOLO-managed agent work.

Examples:

```bash
apolo init
apolo init --workspace .
apolo init --dry-run
```

Use it when:

- onboarding a new repository
- regenerating missing harness files
- creating the `.apolo/` workspace layout
- preparing agent-readable instructions and handoff files

Expected outputs:

- path to the initialized workspace
- default mode and policy summary
- files created or already present
- conflicts if existing files would be overwritten

Important behavior:

- should not overwrite existing user files without explicit approval
- should prefer PR review for repository changes
- should create generic, reusable harness files

### `apolo doctor`

Inspect local readiness.

Examples:

```bash
apolo doctor
apolo doctor --format json
```

Use it when:

- setting up a machine
- debugging why a command cannot run
- checking whether a repo is initialized
- confirming defaults and memory paths

Typical checks:

- current working directory
- manifest/config discovery
- coordinator provider
- approval policy
- Ollama/Qwen defaults
- maximum agents per task
- global memory path
- repository memory path

### `apolo plan`

Create a read-only plan for a task.

Examples:

```bash
apolo plan --task "Add unit tests for the parser"
apolo plan --task "Refactor the auth module safely" --dry-run
apolo plan --task "Investigate failing CI" --format json
```

Use it when:

- the task may modify code
- multiple agents may be useful
- you want a reviewable implementation strategy
- you need verification commands identified before work starts

A good plan should include:

- goal
- scope
- non-goals
- assumptions
- repository context
- proposed agents
- parallelization strategy
- security and write-scope risks
- verification commands
- approval checkpoints

Planning must not execute agent work or mutate repository files.

### `apolo run`

Run an approved plan.

Examples:

```bash
apolo run --from-plan .apolo/plans/2026-05-05-parser-tests.md
apolo run --plan .apolo/plans/latest.json
apolo run --from-plan .apolo/plans/latest.md --dry-run
```

Use it when:

- a plan has been reviewed
- the user has approved execution
- the expected verification path is clear

Expected behavior:

- reject missing or unapproved plans
- enforce max 5 agents
- request fresh approval before side effects
- prepare branch metadata
- route work to agents
- run verification
- record ledger events
- update approved memory
- prepare PR draft metadata

### `apolo sync`

Preview or apply approved state synchronization.

Examples:

```bash
apolo sync --dry-run
apolo sync --format json --dry-run
```

Use it when:

- checking what local state differs from a remote or mirror
- preparing to share approved configuration
- validating sync without side effects

Important behavior:

- dry-run first
- never upload memory or run artifacts silently
- require approval before external side effects

### `apolo memory`

Inspect and manage local memory.

Examples:

```bash
apolo memory list
apolo memory search "parser tests"
apolo memory export --format markdown
apolo memory compact --dry-run
```

Use it when:

- searching previous decisions
- exporting context for review
- compacting old task summaries
- inspecting global or repository memory

Memory principles:

- SQLite local storage
- global and repository namespaces
- source metadata preserved
- sensitive content blocked or redacted
- approval required before writes

### `apolo agents`

Inspect configured agents and capabilities.

Examples:

```bash
apolo agents
apolo agents list
apolo agents detect
apolo agents add qa-reviewer --role qa --dry-run
```

Use it when:

- checking which CLIs are installed
- validating agent capability routing
- confirming the max 5 agent limit
- previewing registry changes

Supported agents:

| Agent | Typical role |
| --- | --- |
| Claude Code | default coordinator, planning, complex coding, PR workflow |
| Codex CLI | coding, review, PR workflow |
| GitHub Copilot CLI | suggestions and coding assistance |
| OpenCode | implementation and local tasks |
| Gemini CLI | research, review, selected coding tasks |
| Cursor CLI | coding tasks through local Cursor tooling |
| Ollama Qwen | local analysis and fallback workflows |

## Common workflows

### Initialize and plan a first task

```bash
apolo init
apolo doctor
apolo plan --task "Map the repository and recommend first verification checks"
```

### Execute an approved implementation

```bash
apolo plan --task "Add validation for config loading"
# review and approve the plan
apolo run --from-plan .apolo/plans/config-validation.md
```

### Use APOLO safely in CI-like environments

```bash
apolo doctor --format json
apolo plan --task "Check readiness" --dry-run
apolo sync --dry-run
```

Use dry-run commands to inspect behavior without mutating files.

### Inspect memory before planning

```bash
apolo memory search "config loading"
apolo plan --task "Improve config loading errors"
```

Memory should help the planner avoid rediscovering old decisions.

## Files created by initialization

Depending on configuration, initialization may create:

```text
.apolo/
  manifest.json
  apolo.yaml
  gates.yaml
  apolo-progress.md
  session-handoff.md
  quality-document.md
  memory/
  plans/
  runs/
AGENTS.md
CLAUDE.md
init.sh
```

The exact file set depends on repository detection and existing files.

## Approval model

Human approval is required before:

- running agents
- modifying files
- executing shell commands with side effects
- destructive operations
- writing memory
- syncing state outside the local workspace
- preparing PR side effects

No convenience flag should bypass this policy.

## Troubleshooting

### `apolo` command not found

Check npm global bin path:

```bash
npm bin -g
npm list -g apolo-cli
```

Then reinstall:

```bash
npm install -g apolo-cli
```

### Repository not initialized

Run:

```bash
apolo init
apolo doctor
```

### Too many agents

APOLO rejects configurations with more than 5 agents per task. Remove or disable agents until the configured set is 5 or fewer.

### Ollama or Qwen unavailable

Check:

```bash
ollama list
ollama pull qwen2.5-coder:latest
```

APOLO can still use other available adapters if the task does not require local-model fallback.

### Plan rejected before execution

Common causes:

- plan was not approved
- plan references too many agents
- write scope is too broad
- sensitive data was detected
- destructive command needs explicit approval
- verification commands are missing or invalid

Review the plan and security gate output before retrying.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Generic runtime failure |
| `2` | Invalid command or arguments |
| `64` | Command contract exists but implementation is unavailable or blocked |
| `70` | Dependency or environment check failed |
| `78` | Configuration invalid |
