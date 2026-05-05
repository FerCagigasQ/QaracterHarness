# APOLO-CLI

APOLO-CLI is a local, terminal-only CLI for coordinating work in any repository. This repository starts with the bootstrap and CLI core only: package metadata, command routing, configuration defaults, logging, filesystem layout helpers, a manifest model, basic error handling, tests, and CI.

## Core defaults

- Runtime direction: TypeScript CLI with Python-ready backend metadata.
- Distribution: npm global package with the `apolo` binary.
- Coordinator: Claude.
- Local model default: Ollama `qwen`.
- Safety: explicit human approval is required before `apolo run`.
- Agent limit: maximum 5 agents per task.
- Repository initialization: pull-request flow only; direct main changes are disabled in the manifest.
- Memory: local SQLite paths for global and repository memory.

## Quickstart

```bash
npm install
npm run build
npm link
apolo --help
apolo init
apolo doctor
```

Run the baseline checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Commands

The visible command surface is available now:

- `apolo init`
- `apolo doctor`
- `apolo plan`
- `apolo run`
- `apolo sync`
- `apolo memory`
- `apolo agents`

Only workstream 01 bootstrap behavior is implemented. Commands owned by later workstreams intentionally return stable stubs/interfaces until their internals are added.

## Filesystem layout

`apolo init` creates:

```text
.apolo/
  manifest.json
  memory/
    repo.sqlite
```

Global memory is located at:

```text
~/.apolo/memory/global.sqlite
```

Set `APOLO_HOME` to override the global APOLO directory.
