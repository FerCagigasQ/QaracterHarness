# Packaging and release validation

The MVP package is npm-global first. The public binary name is `apolo`.

APOLO 1.0 packaging is TypeScript/Node.js-only at runtime. Python is optional for verifying Python target repositories, running source-checkout fixture tests, or future plugin workers; it is not required by the npm package.

## Package contract

`package.json` must define:

- package name and semantic version
- Node.js engine support
- `bin.apolo`
- `files` allowlist for publishable assets
- validation scripts for typecheck, package contract, integration tests, Python fixture tests, and global bin smoke
- no production dependencies and no Python runtime dependency

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
- development packaging scripts, TypeScript source, tests, and Python files are excluded from the tarball
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

## Release readiness checklist

- package validation passes on Windows, macOS, and Linux
- Node.js 20 and 22 pass CI
- Python 3.11 and 3.12 pass source-checkout fixture and target-verification tests
- command docs match implemented command names
- approval policy cannot be bypassed by flags
- package tarball excludes local caches and secrets
- package tarball excludes Python source files and has no Python runtime dependency
- examples remain generic and runnable in a sandbox
- `CHANGELOG.md` includes user-facing changes, migration notes, and verification evidence for the release

## Changelog guidance

For each release, add or update a `CHANGELOG.md` entry with:

- package version and date
- user-facing CLI changes
- packaging/runtime notes, including TypeScript/Node-only runtime expectations
- any optional Python target-verification or plugin changes
- validation commands run before release

## Replacing the packaging shim

The current bin is a narrow packaging shim. Runtime implementation PRs should replace it with the real TypeScript CLI entrypoint while preserving:

- binary name: `apolo`
- command names: `init`, `doctor`, `plan`, `run`, `sync`, `memory`, `agents`
- `--help` and `--version`
- dry-run support for smoke tests
- deterministic exit codes
