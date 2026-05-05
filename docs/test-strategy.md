# Test strategy

Workstream 08 provides the test surface that implementation PRs can plug into without owning feature modules.

## Test layers

| Layer | Command | Purpose |
| --- | --- | --- |
| TypeScript validation | `npm run typecheck` | Validate JavaScript/TypeScript syntax and project config. |
| Package contract | `npm run package:check` | Validate npm metadata and pack contents. |
| Node integration | `npm test` | Validate docs, command references, package contract, and fixture shape. |
| Python fixtures | `npm run test:python` | Validate reusable JSON fixtures and harness helpers. |
| Global bin smoke | `npm run smoke:bin` | Pack, install, and execute the global `apolo` bin from a temporary prefix. |

## CI matrix

The workflow runs on:

- Windows latest
- macOS latest
- Ubuntu latest
- Node.js 20 and 22
- Python 3.11 and 3.12

This catches path, shell, npm shim, and Python compatibility issues early.

## Fixture contract

Fixtures under `test/fixtures/` model a generic minimal workspace.

Required policies:

- `coordinator` is `claude`
- local model provider is `ollama`
- local model is `qwen`
- `maxAgents` is no greater than 5
- `humanApproval` is `always`
- plan fixtures require approval before execution

## Plugging in a real CLI

Future PRs can set `APOLO_BIN` to run command-level integration tests against a built CLI:

```bash
APOLO_BIN=/absolute/path/to/apolo python -m unittest discover -s test/harness -p "test_*.py"
```

Harness helpers copy fixtures to a temporary workspace, run commands with isolated environment variables, and capture stdout, stderr, and exit code.

## Smoke scenarios to add as features land

1. `apolo init --dry-run` prints the workspace files it would create.
2. `apolo init` creates `.apolo/` after approval.
3. `apolo doctor --format json` validates package, model, Python, config, and approval policy.
4. `apolo plan --task ... --dry-run` returns a plan preview without side effects.
5. `apolo run --plan ... --dry-run` rejects unapproved plans.
6. `apolo agents add ... --dry-run` enforces the max 5 agent limit.
7. `apolo memory add ... --dry-run` refuses sensitive-looking content.
8. `apolo sync --dry-run` reports incoming/outgoing state without mutating files.

## Test data rules

- Keep fixtures generic.
- Do not include credentials, tokens, private URLs, or organization-specific content.
- Prefer JSON fixtures with explicit schema-like fields.
- Keep fixture names stable so other PRs can depend on them.
