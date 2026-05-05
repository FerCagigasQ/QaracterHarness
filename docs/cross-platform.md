# Cross-platform notes

APOLO CLI targets Windows, macOS, and Linux from the first npm package.

## Shell compatibility

Documentation examples should prefer commands that work in PowerShell, Bash, and Zsh where possible.

Use platform-specific examples only when needed:

| Task | Windows PowerShell | macOS/Linux |
| --- | --- | --- |
| Set test binary | `$env:APOLO_BIN="C:\path\apolo.cmd"` | `APOLO_BIN=/path/apolo` |
| Remove local metadata | `Remove-Item -Recurse -Force .apolo` | `rm -rf .apolo` |
| Print version | `apolo --version` | `apolo --version` |

## Paths

Implementation PRs should:

- use Node.js `path` helpers instead of string concatenation
- avoid assuming `/tmp`, `/usr/local`, or drive-letter paths
- quote workspace paths in examples
- test paths containing spaces
- normalize path separators only at display boundaries

## Process execution

When invoking Python, Ollama, or other local tools:

- resolve executables through the platform `PATH`
- pass arguments as arrays instead of shell-joined strings
- stream stdout and stderr without requiring a TTY
- handle `SIGINT` on macOS/Linux and console interruption on Windows

## npm global bin behavior

The smoke test installs the packed tarball with a temporary npm global prefix and resolves the generated `apolo` shim:

- Windows: `<prefix>\apolo.cmd`
- macOS/Linux: `<prefix>/bin/apolo`

Implementation PRs should keep this behavior green before changing package metadata.

## Line endings and encodings

- Store source, docs, and fixtures as UTF-8.
- Keep JSON fixtures with LF line endings.
- Do not require terminal color support for parsing test output.
- Ensure JSON output is stable in non-interactive CI.
