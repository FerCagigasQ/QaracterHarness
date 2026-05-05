# APOLO-CLI run workflow

Workstream 07 owns the run executor, verification, and PR workflow seams. For APOLO-CLI 1.0, the mandatory product contract is TypeScript/Node.js; Python modules in this area are legacy/reference seams unless they are invoked through stable JSON contracts.

## Goals

- Execute only approved plans.
- Require human approval before any non-dry-run execution.
- Route approved plan work to 1-5 logical agents.
- Delegate work through execution interfaces instead of provider-specific code.
- Run detected verification commands.
- Record run ledger events.
- Update memory through a narrow interface.
- Prepare branch and PR draft metadata through Claude or Codex provider stubs.

## State machine

1. `run.created`
2. `plan.loaded`
3. `security.checked`
4. `agents.routed`
5. `approval.requested`
6. `git.branch.prepared`
7. `execution.skipped` for dry runs or `execution.completed` for approved execution
8. `verification.completed`
9. `memory.updated`
10. `pr.prepared`
11. `run.completed`

If approval is pending or rejected, the run pauses before branch preparation and execution. If an exception is raised, the ledger records `run.failed`.

## Interfaces

The stable run artifact is the JSONL `apolo.run_event` ledger defined in `src/contracts/schemas.ts` and documented in `docs/product-contracts.md`.

Legacy/reference `src/run/interfaces.py` defines integration seams for:

- plan loading
- security policy
- approval gateway
- logical agent routing
- execution delegation
- verification runner
- memory store
- git/PR workflow
- init hooks

These are intentionally small so other workstreams can bind their implementations without changing the run executor.

## Dry-run behavior

Dry-run mode still loads the approved plan, checks policy, routes logical agents, asks for approval, prepares branch metadata after approval, emits skipped execution results, runs verification, records memory, and prepares a PR draft.

## Verification

`src/verification/commands.ts` detects common local checks for the target repository:

- Node: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` when present in `package.json`.
- Python target repos: `python -m ruff check .`, `python -m mypy .`, `python -m pytest`, or `python -m unittest discover -s tests` when project markers request them. Python is detected as a target repo stack, not required for the APOLO npm runtime.
- Make: `make lint`, `make typecheck`, `make build`, and `make test` when targets are present.
- Safe fallback: a no-op structured success when no known stack is detected.

The command runner applies per-command timeouts, redacts output, returns structured results, and does not terminate orchestration on the first failing check.

## PR workflow

`src/git/pr.py` creates PR draft content and restricts provider values to `claude` or `codex`. The draft includes summary, verification, and approval sections. Actual PR submission is left to provider adapters.
