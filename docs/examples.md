# Examples

The examples are generic and safe to copy into a local sandbox.

## Minimal config

See [`examples/apolo.config.example.json`](../examples/apolo.config.example.json).

Key policies:

- coordinator: Claude
- local model: Qwen through Ollama
- max agents: 5
- approval: always

## Initialize a workspace

```bash
apolo init --workspace .
```

Dry-run preview:

```bash
apolo init --workspace . --dry-run
```

## Check readiness

```bash
apolo doctor --format json
```

Expected categories:

- package/bin
- workspace config
- local model availability
- Python availability when enabled
- approval policy
- agent limit

## Create a plan

```bash
apolo plan --task "Review the repository structure and propose a safe test plan"
```

## Run an approved plan

```bash
apolo run --plan .apolo/plans/latest.json
```

The CLI should display the approval checkpoint before execution starts.

## Manage agents

```bash
apolo agents list
apolo agents add qa-reviewer --role qa --dry-run
```

## Manage memory

```bash
apolo memory list
apolo memory add --from .apolo/runs/run-001/summary.json --dry-run
```

## Sync safely

```bash
apolo sync --dry-run
```

The dry run should show exactly what would be synchronized without applying changes.
