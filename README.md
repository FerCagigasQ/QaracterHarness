# APOLO CLI MVP

APOLO CLI is a local-first command line interface for planning, running, synchronizing, and auditing multi-agent development workflows from a terminal.

This repository currently defines the workstream 08 quality, packaging, and documentation layer:

- user-facing usage docs and command reference
- architecture and cross-platform notes
- npm package metadata and global `apolo` bin smoke validation
- integration test harness and fixtures that implementation PRs can reuse
- Windows, macOS, and Linux CI matrix for Node.js and Python compatibility

## MVP defaults

| Area | Default |
| --- | --- |
| Install path | npm global package first |
| CLI binary | `apolo` |
| Coordinator | Claude |
| Local model | Qwen through Ollama |
| Agent limit | maximum 5 agents |
| Approval mode | human approval always required before agent execution or external side effects |
| Supported OS | Windows, macOS, Linux |
| Core commands | `init`, `doctor`, `plan`, `run`, `sync`, `memory`, `agents` |

## Quick start

```bash
npm install -g apolo-cli
apolo --help
apolo init --workspace .
apolo doctor
apolo plan --task "Summarize the current repository and propose next steps"
apolo run --plan .apolo/plans/latest.json
```

The package included in this branch exposes a packaging shim only. Runtime command implementations should replace the shim while keeping the same binary and command contracts.

## Documentation

- [Command reference](docs/command-reference.md)
- [Usage guide](docs/usage.md)
- [Architecture overview](docs/architecture.md)
- [Packaging and release validation](docs/packaging.md)
- [Cross-platform notes](docs/cross-platform.md)
- [Test strategy](docs/test-strategy.md)
- [Examples](docs/examples.md)

## Repository layout

```text
docs/                 User docs, command reference, architecture, QA strategy
examples/             Copyable generic configuration and workflow examples
packaging/            npm package and bin validation scripts
test/fixtures/        Reusable integration fixtures for future command tests
test/harness/         Python fixture and CLI harness helpers
test/integration/     Node-based docs/package contract tests
.github/workflows/    Cross-platform packaging and smoke CI
```

## Local validation

```bash
npm ci
npm run typecheck
npm run package:check
npm test
npm run test:python
npm run smoke:bin
```

`npm run smoke:bin` creates a package tarball, installs it into a temporary global prefix, and validates that `apolo --help`, `apolo --version`, and dry-run command paths work on the current platform.

## Integration harness

Future implementation PRs can plug real command binaries into the Python harness:

```bash
APOLO_BIN=/absolute/path/to/apolo python -m unittest discover -s test/harness -p "test_*.py"
```

Fixtures under `test/fixtures/` enforce generic MVP policies: Claude coordinator, Qwen via Ollama, max 5 agents, and approval required before execution.
