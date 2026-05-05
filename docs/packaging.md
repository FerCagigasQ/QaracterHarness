# Packaging and release validation

The MVP package is npm-global first. The public binary name is `apolo`.

## Package contract

`package.json` must define:

- package name and semantic version
- Node.js engine support
- `bin.apolo`
- `files` allowlist for publishable assets
- validation scripts for typecheck, package contract, integration tests, legacy Python harness compatibility, Vitest coverage, and global bin smoke

## Validation commands

```bash
npm ci
npm run typecheck
npm run package:check
npm test
npm run test:python
npm run smoke:bin
```

## `npm run package:check`

Validates package metadata and dry-runs `npm pack`.

The check verifies:

- `bin.apolo` points to an existing file
- the bin has a Node.js shebang
- required scripts exist
- publishable docs and examples are included in the tarball
- the package can be packed without publishing

## `npm run smoke:bin`

Runs a realistic global install flow without touching the user's global npm prefix:

1. create a temporary directory
2. run `npm pack`
3. install the tarball with `npm install -g --prefix <temp>`
4. resolve the platform-specific `apolo` shim
5. run `apolo --version`
6. run `apolo --help`
7. run dry-run command paths

## `npm run test:python`

This is a legacy compatibility script for workflows that still invoke Python fixture tests. It skips cleanly by default so Python is not required to run APOLO. Set `APOLO_RUN_LEGACY_PYTHON_TESTS=1` to execute the old dependency-free Python harness explicitly.

## Release readiness checklist

- package validation passes on Windows, macOS, and Linux
- Node.js 20 and 22 pass CI
- Python target fixture detection is covered without making Python an APOLO runtime dependency
- command docs match implemented command names
- approval policy cannot be bypassed by flags
- package tarball excludes local caches and secrets
- examples remain generic and runnable in a sandbox

## Replacing the packaging shim

The current bin is a narrow packaging shim. Runtime implementation PRs should replace it with the real TypeScript CLI entrypoint while preserving:

- binary name: `apolo`
- command names: `init`, `doctor`, `plan`, `run`, `sync`, `memory`, `agents`
- `--help` and `--version`
- dry-run support for smoke tests
- deterministic exit codes
