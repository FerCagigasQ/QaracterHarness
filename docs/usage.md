# Usage guide

## Install

```bash
npm install -g apolo-cli
```

Verify the global binary:

```bash
apolo --version
apolo --help
```

## Initialize

```bash
apolo init --workspace .
```

The default workspace config should use:

- Claude coordinator
- Qwen through Ollama for local model workflows
- max 5 agents
- human approval mode `always`

Preview without changes:

```bash
apolo init --workspace . --dry-run
```

## Diagnose

```bash
apolo doctor
apolo doctor --format json
```

Use `doctor` before planning or running tasks. It should report package, workspace, model, approval, and agent-limit readiness. Python checks are only relevant when verifying a Python target repository or an explicitly enabled optional plugin.

## Plan

```bash
apolo plan --task "Inspect the repository and create a safe implementation plan"
```

Planning should create a reviewable artifact and show approval checkpoints before any execution.

## Run

```bash
apolo run --plan .apolo/plans/latest.json
```

Running should require an approved plan and fresh approval before side effects.

## Sync

```bash
apolo sync --dry-run
```

Use dry-run first to inspect local and remote state changes.

## Memory

```bash
apolo memory list
apolo memory add --from .apolo/runs/run-001/summary.json --dry-run
```

Memory writes require approval and should preserve source metadata.

## Agents

```bash
apolo agents list
apolo agents add qa-reviewer --role qa --dry-run
```

The CLI must reject configurations with more than 5 agents.
