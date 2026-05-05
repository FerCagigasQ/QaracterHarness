# APOLO CLI security gates and policies

This workstream defines default local CLI gates that should evaluate a planned run before tools execute. The default stance is deny-by-default for risky behavior and require human approval before any run starts.

For APOLO-CLI 1.0, the portable security event contract is the TypeScript-owned `apolo.security_event` schema in `src/contracts/schemas.ts`. Policy implementations may evolve behind that schema.

## Default policy shape

`apolo.yaml` should expose a top-level `policy` section:

```yaml
policy:
  approval:
    human_approval_required_before_run: true
    risk_approval_required: true
  secrets:
    enabled: true
    redact_token: "[REDACTED_SECRET]"
    allow_dummy_placeholders: true
  destructive_ops:
    enabled: true
    blocked_patterns:
      - "\\brm\\s+-[^\\n]*[rf][^\\n]*\\s+/"
      - "\\bgit\\s+reset\\s+--hard\\b"
      - "\\bgit\\s+clean\\s+-[^\\n]*[fd][^\\n]*\\b"
      - "\\bchmod\\s+-R\\s+777\\b"
      - "\\bmkfs(?:\\.[a-z0-9]+)?\\b"
      - "\\bdd\\s+.*\\bof="
      - "\\bdocker\\s+system\\s+prune\\b"
      - "\\bkubectl\\s+delete\\s+(?:namespace|ns)\\b"
      - "\\bterraform\\s+destroy\\b"
      - "\\bshutdown\\b"
      - "\\breboot\\b"
  tool_allowlist:
    enabled: true
    allowed_tools:
      - read_file
      - search
      - list_files
      - write_file
      - edit_file
      - run_tests
      - run_lint
      - git_diff
      - create_pr
      - update_pr
  write_scope:
    enabled: true
    allowed_paths:
      - src/
      - tests/
      - docs/
      - apolo.yaml
      - .apolo/
    denied_paths:
      - .git/
      - .env
      - .env.
      - id_rsa
      - id_ed25519
      - credentials
  diff_size:
    enabled: true
    max_files_changed: 20
    max_lines_changed: 800
    max_single_file_lines_changed: 300
  memory_write:
    enabled: true
    block_sensitive_data: true
    max_value_length: 4000
  budget:
    enabled: true
    max_tool_calls: 100
    max_runtime_minutes: 30
    max_estimated_cost_usd: 5.0
  permissions:
    pr_writers:
      - claude
      - codex
```

## Gate behavior

| Gate | Default behavior |
| --- | --- |
| Human approval | Blocks every run until a human approval flag is present. |
| Secrets | Blocks sensitive-looking values in commands, tool arguments, file writes, and memory writes. Dummy placeholders are allowed by default for tests and examples. |
| Destructive operations | Blocks destructive shell patterns such as hard resets, recursive deletes, disk formatting, shutdowns, and destructive infrastructure commands unless explicitly approved. |
| Tool allowlist | Blocks tools not listed in `policy.tool_allowlist.allowed_tools` unless explicitly approved. |
| Unauthorized writes | Blocks writes outside configured paths and blocks denied paths such as `.git/`, environment files, credential files, and SSH key filenames unless explicitly approved. |
| Memory writes | Blocks memory writes that contain sensitive data or exceed the configured maximum length unless explicitly approved. |
| Budget | Blocks runs that exceed tool call, runtime, or estimated cost limits unless explicitly approved. |
| Diff size | Blocks risky diffs that exceed file or line thresholds unless explicitly approved. |
| PR permission | Blocks PR create/update tools for actors other than `claude` and `codex`. |

## Redaction

Use `redact_text()` before displaying untrusted command, memory, or file-write content in logs. Redaction replaces matched sensitive spans with the configured redaction token. Tests must use dummy placeholder-only values; do not commit real credentials, tokens, keys, connection strings, or customer secrets.

## Integration contract

The CLI should construct a `PlanRequest` before execution and call `SecurityGateEngine.evaluate()`.

Execution may continue only when:

1. The human approval gate passes.
2. No blocking decision is returned.
3. Any decision that requires approval has a matching explicit approval flag.
4. PR write tools are requested only by approved actors.

Store policy overrides in `apolo.yaml`. If the file is missing, use `PolicyConfig.defaults()`.
