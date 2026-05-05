# `apolo init`

`apolo init` scans a repository and generates a generic APOLO harness.

## Goals

- Work in any repository.
- Detect stack, package managers, validation commands, tests, and CI.
- Create minimal smoke tests when no tests are detected.
- Use a dry-run mode before writing.
- Avoid overwriting user-owned files unless they are APOLO-managed or `--force` is used.
- Leave Git and pull-request handoff metadata as local stubs for higher-level workstreams.

## Usage

```bash
apolo init --repo /path/to/repo --dry-run
apolo init --repo /path/to/repo
```

From a source checkout:

```bash
python -m init.cli init --repo /path/to/repo --dry-run --json
python -m init.cli init --repo /path/to/repo
```

## Generated files

- `AGENTS.md`
- `CLAUDE.md`
- `apolo.yaml`
- `feature_list.json`
- `apolo-progress.md`
- `session-handoff.md`
- `quality-document.md`
- `init.sh`
- `.apolo/manifest.json`
- `.apolo/project-profile.json`
- `.apolo/gates.yaml`
- `.apolo/plans/`
- `.apolo/reports/`
- `apolo-memory/`

When no tests are detected, a minimal smoke test is added using the detected stack. Unknown stacks receive a portable shell smoke test.

## Safe write model

The writer classifies every generated file before writing:

- `create`: file does not exist.
- `update`: file exists and contains the APOLO generated marker, or `--force` was used.
- `skip`: file already matches generated content.
- `conflict`: file exists but is not APOLO-managed.

If any conflict is found, no files are written.

## Git and PR handoff stubs

The init workstream does not open remote pull requests from target repositories. It produces local handoff metadata instead:

- `session-handoff.md` includes current branch, dirty-state, and validation command suggestions.
- `.apolo/manifest.json` records handoff hook names as stubs.
- `src/init/pr_hooks.py` builds a PR title/body/label payload that a later integration can submit.

## Detection coverage

The scanner ignores common dependency, build, cache, and VCS directories. The detector recognizes common Python, JavaScript/TypeScript, Rust, Go, Java, .NET, Ruby, and PHP markers, plus common CI systems.
