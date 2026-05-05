from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields, is_dataclass
from typing import Any, Mapping


APPROVED_WRITERS = ("claude", "codex")


@dataclass(frozen=True)
class ApprovalPolicy:
    human_approval_required_before_run: bool = True
    risk_approval_required: bool = True


@dataclass(frozen=True)
class SecretsPolicy:
    enabled: bool = True
    redact_token: str = "[REDACTED_SECRET]"
    allow_dummy_placeholders: bool = True


@dataclass(frozen=True)
class DestructiveOpsPolicy:
    enabled: bool = True
    blocked_patterns: tuple[str, ...] = (
        r"\brm\s+-[^\n]*[rf][^\n]*\s+/",
        r"\bgit\s+reset\s+--hard\b",
        r"\bgit\s+clean\s+-[^\n]*[fd][^\n]*\b",
        r"\bchmod\s+-R\s+777\b",
        r"\bmkfs(?:\.[a-z0-9]+)?\b",
        r"\bdd\s+.*\bof=",
        r"\bdocker\s+system\s+prune\b",
        r"\bkubectl\s+delete\s+(?:namespace|ns)\b",
        r"\bterraform\s+destroy\b",
        r"\bshutdown\b",
        r"\breboot\b",
    )


@dataclass(frozen=True)
class ToolAllowlistPolicy:
    enabled: bool = True
    allowed_tools: tuple[str, ...] = (
        "read_file",
        "search",
        "list_files",
        "write_file",
        "edit_file",
        "run_tests",
        "run_lint",
        "git_diff",
        "atlassian_read",
        "atlassian_write",
        "create_pr",
        "update_pr",
    )


@dataclass(frozen=True)
class WriteScopePolicy:
    enabled: bool = True
    allowed_paths: tuple[str, ...] = (
        "src/",
        "tests/",
        "docs/",
        "apolo.yaml",
        ".apolo/",
    )
    denied_paths: tuple[str, ...] = (
        ".git/",
        ".env",
        ".env.",
        "id_rsa",
        "id_ed25519",
        "credentials",
    )


@dataclass(frozen=True)
class DiffSizePolicy:
    enabled: bool = True
    max_files_changed: int = 20
    max_lines_changed: int = 800
    max_single_file_lines_changed: int = 300


@dataclass(frozen=True)
class MemoryWritePolicy:
    enabled: bool = True
    block_sensitive_data: bool = True
    max_value_length: int = 4_000


@dataclass(frozen=True)
class BudgetPolicy:
    enabled: bool = True
    max_tool_calls: int = 100
    max_runtime_minutes: int = 30
    max_estimated_cost_usd: float = 5.0


@dataclass(frozen=True)
class PermissionPolicy:
    pr_writers: tuple[str, ...] = APPROVED_WRITERS
    atlassian_writers: tuple[str, ...] = APPROVED_WRITERS


@dataclass(frozen=True)
class PolicyConfig:
    approval: ApprovalPolicy = field(default_factory=ApprovalPolicy)
    secrets: SecretsPolicy = field(default_factory=SecretsPolicy)
    destructive_ops: DestructiveOpsPolicy = field(default_factory=DestructiveOpsPolicy)
    tool_allowlist: ToolAllowlistPolicy = field(default_factory=ToolAllowlistPolicy)
    write_scope: WriteScopePolicy = field(default_factory=WriteScopePolicy)
    diff_size: DiffSizePolicy = field(default_factory=DiffSizePolicy)
    memory_write: MemoryWritePolicy = field(default_factory=MemoryWritePolicy)
    budget: BudgetPolicy = field(default_factory=BudgetPolicy)
    permissions: PermissionPolicy = field(default_factory=PermissionPolicy)

    @classmethod
    def defaults(cls) -> "PolicyConfig":
        return cls()

    @classmethod
    def from_apolo_mapping(cls, mapping: Mapping[str, Any] | None) -> "PolicyConfig":
        if not mapping:
            return cls.defaults()

        policy = mapping.get("policy", mapping)
        if not isinstance(policy, Mapping):
            raise TypeError("apolo policy config must be a mapping")

        return cls(
            approval=_build_dataclass(ApprovalPolicy, policy.get("approval")),
            secrets=_build_dataclass(SecretsPolicy, policy.get("secrets")),
            destructive_ops=_build_dataclass(
                DestructiveOpsPolicy, policy.get("destructive_ops")
            ),
            tool_allowlist=_build_dataclass(
                ToolAllowlistPolicy, policy.get("tool_allowlist")
            ),
            write_scope=_build_dataclass(WriteScopePolicy, policy.get("write_scope")),
            diff_size=_build_dataclass(DiffSizePolicy, policy.get("diff_size")),
            memory_write=_build_dataclass(MemoryWritePolicy, policy.get("memory_write")),
            budget=_build_dataclass(BudgetPolicy, policy.get("budget")),
            permissions=_build_dataclass(PermissionPolicy, policy.get("permissions")),
        )

    def to_apolo_mapping(self) -> dict[str, Any]:
        return {"policy": _to_plain(asdict(self))}


def _build_dataclass(model: type[Any], data: Any) -> Any:
    if data is None:
        return model()
    if not isinstance(data, Mapping):
        raise TypeError(f"{model.__name__} config must be a mapping")

    allowed = {field.name for field in fields(model)}
    clean_data = {
        key: _to_tuple(value)
        for key, value in data.items()
        if key in allowed
    }
    return model(**clean_data)


def _to_tuple(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(value)
    return value


def _to_plain(value: Any) -> Any:
    if is_dataclass(value):
        return _to_plain(asdict(value))
    if isinstance(value, tuple):
        return [_to_plain(item) for item in value]
    if isinstance(value, list):
        return [_to_plain(item) for item in value]
    if isinstance(value, dict):
        return {key: _to_plain(item) for key, item in value.items()}
    return value


def default_apolo_yaml() -> str:
    return """policy:
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
      - "\\\\brm\\\\s+-[^\\\\n]*[rf][^\\\\n]*\\\\s+/"
      - "\\\\bgit\\\\s+reset\\\\s+--hard\\\\b"
      - "\\\\bgit\\\\s+clean\\\\s+-[^\\\\n]*[fd][^\\\\n]*\\\\b"
      - "\\\\bchmod\\\\s+-R\\\\s+777\\\\b"
      - "\\\\bmkfs(?:\\\\.[a-z0-9]+)?\\\\b"
      - "\\\\bdd\\\\s+.*\\\\bof="
      - "\\\\bdocker\\\\s+system\\\\s+prune\\\\b"
      - "\\\\bkubectl\\\\s+delete\\\\s+(?:namespace|ns)\\\\b"
      - "\\\\bterraform\\\\s+destroy\\\\b"
      - "\\\\bshutdown\\\\b"
      - "\\\\breboot\\\\b"
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
      - atlassian_read
      - atlassian_write
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
    atlassian_writers:
      - claude
      - codex
"""
