# APOLO plan approval run workflow

APOLO starts in read-only Plan Mode. A plan reads repository context, `apolo.yaml`, memory, and harness files when present, then writes a markdown plan and records pending human approval.

## Create a plan

```bash
apolo plan "Implement the requested task"
```

This writes:

- `.apolo/plans/<id>.md`
- `.apolo/approvals/<id>.json`

The plan includes task classification, uncertainties, strategy, steps, up to five suggested agents, verification checks, risk/cost estimate, likely files, and approval instructions.

## Approve or reject

```bash
apolo approve <id>
apolo reject <id>
```

`run` is blocked unless the approval record is `approved`.

## Run handoff

```bash
apolo run --from-plan <id>
```

This validates the approval record and plan markdown, then returns the executor handoff. The full run executor is intentionally outside this workstream.
