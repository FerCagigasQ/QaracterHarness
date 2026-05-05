from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RedactionFinding:
    kind: str
    placeholder: str


@dataclass(frozen=True)
class RedactionResult:
    text: str
    findings: tuple[RedactionFinding, ...]

    @property
    def changed(self) -> bool:
        return bool(self.findings)


REDACTION_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "private_key",
        re.compile(
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
            re.DOTALL,
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (
        "aws_access_key",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "[REDACTED_AWS_ACCESS_KEY]",
    ),
    (
        "jwt",
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        "[REDACTED_JWT]",
    ),
    (
        "authorization_header",
        re.compile(r"(?i)\b(authorization\s*:\s*(?:bearer|basic)\s+)[A-Za-z0-9._~+/=-]{8,}"),
        r"\1[REDACTED_AUTHORIZATION]",
    ),
    (
        "assignment_secret",
        re.compile(
            r"(?i)\b(password|passwd|api[_-]?key|token|secret|client[_-]?secret)\b"
            r"(\s*[:=]\s*)"
            r"([\"']?)[A-Za-z0-9._~+/=-]{8,}\3"
        ),
        r"\1\2[REDACTED_SECRET]",
    ),
    (
        "url_credentials",
        re.compile(r"([a-z][a-z0-9+.-]*://)([^/\s:@]+):([^@\s/]+)@"),
        r"\1[REDACTED_USER]:[REDACTED_PASSWORD]@",
    ),
)


def redact_text(text: str) -> RedactionResult:
    findings: list[RedactionFinding] = []
    redacted = text
    for kind, pattern, placeholder in REDACTION_PATTERNS:
        redacted, count = pattern.subn(placeholder, redacted)
        findings.extend(RedactionFinding(kind, placeholder) for _ in range(count))
    return RedactionResult(redacted, tuple(findings))
