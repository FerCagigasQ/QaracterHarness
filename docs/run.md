# APOLO-CLI run workflow

Workstream 07 owns the run executor, verification, and PR workflow seams.

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

`src/run/interfaces.py` defines integration seams for:

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

`src/verification/commands.py` detects common local checks:

- Python: `python -m unittest discover` when Python project/test files exist.
- Node: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` when present in `package.json`.
- Make: `make lint`, `make typecheck`, `make build`, and `make test` when targets are present.

The command runner returns structured results and does not terminate orchestration on the first failing check.

## PR workflow

`src/git/pr.py` creates PR draft content and restricts provider values to `claude` or `codex`. The draft includes summary, verification, and approval sections. Actual PR submission is left to provider adapters.
