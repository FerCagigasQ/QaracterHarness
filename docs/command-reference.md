# Command reference

All commands are invoked through the global binary:

```bash
apolo <command> [options]
```

## Global flags

| Flag | Purpose |
| --- | --- |
| `--config <path>` | Load an explicit config file instead of auto-discovery. |
| `--workspace <path>` | Run against a specific workspace directory. |
| `--format text,json` | Select human-readable or JSON output. |
| `--dry-run` | Print the action plan without executing side effects. |
| `--help` | Show command help. |
| `--version` | Print package version. |

No flag may bypass the human approval gate for agent execution or external side effects.

## `apolo init`

Initializes an APOLO workspace.

```bash
apolo init --workspace .
```

Expected behavior:

- create `.apolo/` metadata folders when approved
- write a default config with Claude coordinator, Qwen through Ollama, max 5 agents, and approval mode `always`
- avoid overwriting existing config unless the user approves the exact change
- support `--dry-run` for previewing created paths

## `apolo doctor`

Checks local readiness.

```bash
apolo doctor
```

Recommended checks:

- Node.js version supports the package
- Ollama is reachable when local Qwen workflows are enabled
- workspace config is valid
- agent count is 5 or fewer
- approval policy is set to `always`
- package bin is available when installed globally

## `apolo plan`

Creates a plan for a task without executing it.

```bash
apolo plan --task "Add tests for the parser"
```

Expected behavior:

- load workspace context
- call the default coordinator adapter
- include required human approval checkpoints
- write a plan artifact only after approval
- support JSON output for automation

## `apolo run`

Runs an approved plan.

```bash
apolo run --from-plan .apolo/plans/latest.json --approve
```

Expected behavior:

- load JSON or markdown plan artifacts
- reject plans without explicit approval or approval prompting
- enforce max 5 agents and security gates before side effects
- capture a JSONL ledger and checkpoint under `.apolo/runs/<run-id>/`
- execute through dry-run, fake-agent, or command-spec adapter seams
- run verification, record memory, and prepare Claude/Codex PR metadata without pushing to main
- resume terminal checkpoints with `apolo run --resume <run-id>`

## `apolo sync`

Synchronizes approved workspace state.

```bash
apolo sync --dry-run
```

Expected behavior:

- show incoming and outgoing changes before applying them
- never upload local memory or run artifacts without approval
- support a local-only dry run for CI and tests

## `apolo memory`

Manages local memory entries.

```bash
apolo memory list
apolo memory search storage
apolo memory show <id>
apolo memory add --title "Decision" --body "Use local JSONL storage" --type decision --tag storage
apolo memory export --format markdown
```

Expected behavior:

- list, search, show, add, and export user-approved memory
- preserve source metadata and timestamps
- avoid storing secrets or private credentials
- require approval before write operations

## `apolo agents`

Manages configured agents.

```bash
apolo agents list
apolo agents add reviewer --role qa --dry-run
```

Expected behavior:

- list configured agents and capabilities
- validate the max 5 agent limit
- show which model or adapter each agent uses
- require approval before changing the registry

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Generic runtime failure. |
| `2` | Invalid command or arguments. |
| `64` | Command contract exists, but runtime implementation is unavailable or blocked. |
| `70` | Dependency or environment check failed. |
| `78` | Configuration invalid. |
