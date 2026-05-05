from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from src.policy.config import SecretsPolicy


@dataclass(frozen=True)
class SensitiveMatch:
    kind: str
    start: int
    end: int


SENSITIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "named_secret",
        re.compile(
            r"(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|"
            r"client[_-]?secret|password|passwd|pwd|private[_-]?key)\b"
            r"\s*[:=]\s*['\"]?([^\s'\"<>]{8,})"
        ),
    ),
    ("bearer_token", re.compile(r"(?i)\bbearer\s+([a-z0-9._~+/=-]{20,})")),
    ("jwt", re.compile(r"\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b")),
    ("aws_access_key", re.compile(r"\bA[KS]IA[0-9A-Z]{16}\b")),
    (
        "private_key_block",
        re.compile(
            r"-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PRIVATE)\s+PRIVATE\s+KEY-----"
            r".*?"
            r"-----END\s+(?:RSA|DSA|EC|OPENSSH|PRIVATE)\s+PRIVATE\s+KEY-----",
            re.DOTALL,
        ),
    ),
    (
        "connection_string",
        re.compile(
            r"(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^:\s/@]+:[^@\s]+@[^ \n]+"
        ),
    ),
)


DUMMY_MARKERS = (
    "DUMMY",
    "EXAMPLE",
    "PLACEHOLDER",
    "FAKE",
    "TEST_ONLY",
    "NOT_A_SECRET",
    "REDACTED",
)


def find_sensitive_data(
    text: str | None,
    policy: SecretsPolicy | None = None,
) -> list[SensitiveMatch]:
    if not text:
        return []

    active_policy = policy or SecretsPolicy()
    if not active_policy.enabled:
        return []

    matches: list[SensitiveMatch] = []
    for kind, pattern in SENSITIVE_PATTERNS:
        for match in pattern.finditer(text):
            if active_policy.allow_dummy_placeholders and _looks_like_dummy(
                match.group(0)
            ):
                continue
            start = match.start(1) if match.lastindex else match.start()
            end = match.end(1) if match.lastindex else match.end()
            matches.append(SensitiveMatch(kind=kind, start=start, end=end))

    return _dedupe_matches(matches)


def contains_sensitive_data(
    text: str | None,
    policy: SecretsPolicy | None = None,
) -> bool:
    return bool(find_sensitive_data(text, policy))


def redact_text(
    text: str | None,
    policy: SecretsPolicy | None = None,
) -> str:
    if text is None:
        return ""

    active_policy = policy or SecretsPolicy()
    matches = find_sensitive_data(text, active_policy)
    if not matches:
        return text

    redacted: list[str] = []
    cursor = 0
    for match in matches:
        redacted.append(text[cursor:match.start])
        redacted.append(active_policy.redact_token)
        cursor = match.end
    redacted.append(text[cursor:])
    return "".join(redacted)


def _looks_like_dummy(value: str) -> bool:
    upper_value = value.upper()
    return any(marker in upper_value for marker in DUMMY_MARKERS)


def _dedupe_matches(matches: Iterable[SensitiveMatch]) -> list[SensitiveMatch]:
    sorted_matches = sorted(matches, key=lambda item: (item.start, -(item.end - item.start)))
    deduped: list[SensitiveMatch] = []
    last_end = -1
    for match in sorted_matches:
        if match.start < last_end:
            continue
        deduped.append(match)
        last_end = match.end
    return deduped
