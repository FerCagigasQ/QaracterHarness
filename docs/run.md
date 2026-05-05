# APOLO-CLI run workflow

Workstream 07 owns the run executor, verification, and PR workflow seams.
The TypeScript CLI entrypoint implements the focused end-to-end path:

```bash
apolo run --from-plan .apolo/plans/latest.json --approve
```

## Goals

- Execute only approved or explicitly approval-prompted plans.
- Require human approval before any non-dry-run execution.
- Route approved plan work to 1-5 logical agents.
- Delegate work through execution interfaces instead of provider-specific code.
- Run detected verification commands.
- Record run ledger events.
- Update memory through a narrow interface.
- Prepare branch and PR draft metadata through Claude or Codex provider stubs.

## State machine

Final user-visible states are `approval_required`, `running`, `failed`, `verification_failed`, `completed`, and `needs_review`.

1. `run.created` or `run.resumed`
2. `plan.loaded`
3. `security.checked`
4. `agents.routed`
5. `execution.started`
6. `execution.completed`
7. `verification.completed`
8. `memory.updated`
9. `pr.prepared`
10. `run.finished`

If approval is missing or a security gate blocks the plan, the run pauses before execution side effects. Each run writes `.apolo/runs/<run-id>/ledger.jsonl` plus `checkpoint.json`; terminal checkpoints can be resumed with `apolo run --resume <run-id>`.

## Interfaces

The TypeScript implementation keeps small adapter seams for:

- plan loading
- security policy
- logical agent routing
- execution delegation
- verification runner
- memory store
- git/PR workflow

## Dry-run behavior

Dry-run mode still loads the approved plan, checks policy, routes logical agents, emits skipped execution results, runs verification, records memory, and prepares a PR metadata artifact.

Tests can pass `--fake-agent` to exercise orchestration without invoking real agent commands. Real execution uses per-step command specs through the command adapter seam.

## Verification

`src/verification/commands.py` detects common local checks:

- Python: `python -m unittest discover` when Python project/test files exist.
- Node: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test` when present in `package.json`.
- Make: `make lint`, `make typecheck`, `make build`, and `make test` when targets are present.

The command runner returns structured results and does not terminate orchestration on the first failing check.

## PR workflow

`src/run/git.ts` creates PR metadata and restricts provider values to `claude` or `codex`. The metadata includes summary, execution, verification, diff, approval, branch, and no-direct-main-push policy fields. Actual PR submission is left to provider adapters.
