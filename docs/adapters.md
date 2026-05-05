# APOLO CLI adapter and routing workstream

This workstream provides the local adapter and routing layer for the APOLO CLI MVP. It is intentionally safe-by-default: command construction returns dry-run command specs, and real subprocess execution requires explicit opt-in.

## Supported adapters

| Adapter ID | Local executable detection | Default dry-run command shape | Main capabilities |
| --- | --- | --- | --- |
| `claude-code` | `claude` | `claude --print <prompt>` | Default coordinator, simple, bug, feature, security, performance, PR writes, Atlassian writes |
| `codex-cli` | `codex` | `codex exec <prompt>` | Simple, bug, feature, security, performance, PR writes, Atlassian writes |
| `github-copilot-cli` | `gh` | `gh copilot suggest <prompt>` | Simple, bug, feature, performance |
| `opencode` | `opencode` | `opencode run <prompt>` | Simple, bug, feature, security, performance |
| `gemini-cli` | `gemini` | `gemini --prompt <prompt>` | Simple, feature, security, performance |
| `cursor-cli` | `cursor-agent`, fallback `cursor` | `cursor-agent --prompt <prompt>` | Simple, bug, feature, performance |
| `ollama-qwen` | `ollama` | `ollama run qwen2.5-coder:latest <prompt>` | Local simple, bug, performance tasks with Qwen as the default model |

## Detection

`src.agents.detection.detect_local_agents()` checks each adapter's executable candidates with `shutil.which` by default. Tests inject a resolver function so detection decisions are deterministic and do not require the tools to be installed.

## Safety model

Adapters expose `build_command(..., dry_run=True)` and return `CommandSpec` values. `DryRunExecutor` echoes the command and never launches a subprocess. `SubprocessRunExecutor` also returns dry-run results unless a command is explicitly marked non-dry-run, and it rejects dangerous command specs unless constructed with `allow_dangerous=True`.

## Routing model

`src.routing.router.route_task()` classifies prompts as `simple`, `bug`, `feature`, `security`, or `performance`, then selects locally detected adapters that support the task kind. Claude Code is the default coordinator when available. If PR writes or Atlassian writes are requested, routing filters execution to Claude Code and Codex CLI only.

The router enforces a hard maximum of five agents per decision. Requests above that cap or heuristic selections that exceed the caller's configured cap raise `RoutingError` instead of silently over-routing.
