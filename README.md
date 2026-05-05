# QaracterHarness

APOLO-CLI MVP harness tooling.

This repository currently contains workstream 04: `apolo init` and the generic harness generator. The generator is intentionally repository-agnostic and avoids organization-specific content.

## Quick start

```bash
python -m init.cli init --repo /path/to/repo --dry-run
python -m init.cli init --repo /path/to/repo
```

## Development

```bash
python -m unittest discover -s tests
```
