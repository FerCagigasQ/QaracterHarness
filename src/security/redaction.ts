export interface SecretsPolicy {
  readonly enabled: boolean;
  readonly redactToken: string;
  readonly allowDummyPlaceholders: boolean;
}

export interface SensitiveMatch {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
}

export interface RedactionResult {
  readonly text: string;
  readonly findings: readonly SensitiveMatch[];
  readonly changed: boolean;
}

export const defaultSecretsPolicy: SecretsPolicy = {
  enabled: true,
  redactToken: "[REDACTED_SECRET]",
  allowDummyPlaceholders: true
};

const sensitivePatterns: readonly [string, RegExp][] = [
  [
    "named_secret",
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd|private[_-]?key)\b\s*[:=]\s*['"]?([^\s'"<>]{8,})/gi
  ],
  ["bearer_token", /\bbearer\s+([a-z0-9._~+/=-]{20,})/gi],
  ["jwt", /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g],
  ["aws_access_key", /\bA[KS]IA[0-9A-Z]{16}\b/g],
  [
    "private_key_block",
    /-----BEGIN\s+(?:(?:RSA|DSA|EC|OPENSSH)\s+)?PRIVATE\s+KEY-----.*?-----END\s+(?:(?:RSA|DSA|EC|OPENSSH)\s+)?PRIVATE\s+KEY-----/gs
  ],
  ["connection_string", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:[^@\s]+@[^ \n]+/gi],
  ["authorization_header", /\b(authorization\s*:\s*(?:bearer|basic)\s+)([A-Za-z0-9._~+/=-]{8,})/gi],
  ["url_credentials", /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi]
];

const dummyMarkers = [
  "DUMMY",
  "EXAMPLE",
  "PLACEHOLDER",
  "FAKE",
  "TEST_ONLY",
  "NOT_A_SECRET",
  "REDACTED"
];

export function findSensitiveData(text: string | undefined | null, policy: Partial<SecretsPolicy> = {}): readonly SensitiveMatch[] {
  if (!text) {
    return [];
  }

  const activePolicy = resolveSecretsPolicy(policy);
  if (!activePolicy.enabled) {
    return [];
  }

  const matches: SensitiveMatch[] = [];
  for (const [kind, sourcePattern] of sensitivePatterns) {
    const pattern = new RegExp(sourcePattern.source, sourcePattern.flags);
    for (const match of text.matchAll(pattern)) {
      const matchedText = match[0] ?? "";
      if (activePolicy.allowDummyPlaceholders && looksLikeDummy(matchedText)) {
        continue;
      }

      const secretText = captureToRedact(kind, match) ?? matchedText;
      const start = (match.index ?? 0) + matchedText.indexOf(secretText);
      matches.push({ kind, start, end: start + secretText.length });
    }
  }

  return dedupeMatches(matches);
}

export function containsSensitiveData(text: string | undefined | null, policy: Partial<SecretsPolicy> = {}): boolean {
  return findSensitiveData(text, policy).length > 0;
}

export function redactText(text: string | undefined | null, policy: Partial<SecretsPolicy> = {}): RedactionResult {
  if (text === undefined || text === null) {
    return { text: "", findings: [], changed: false };
  }

  const activePolicy = resolveSecretsPolicy(policy);
  const findings = findSensitiveData(text, activePolicy);
  if (findings.length === 0) {
    return { text, findings, changed: false };
  }

  let cursor = 0;
  const redacted: string[] = [];
  for (const finding of findings) {
    redacted.push(text.slice(cursor, finding.start));
    redacted.push(activePolicy.redactToken);
    cursor = finding.end;
  }
  redacted.push(text.slice(cursor));
  return { text: redacted.join(""), findings, changed: true };
}

export function resolveSecretsPolicy(policy: Partial<SecretsPolicy> = {}): SecretsPolicy {
  return {
    enabled: policy.enabled ?? defaultSecretsPolicy.enabled,
    redactToken: policy.redactToken ?? defaultSecretsPolicy.redactToken,
    allowDummyPlaceholders: policy.allowDummyPlaceholders ?? defaultSecretsPolicy.allowDummyPlaceholders
  };
}

function captureToRedact(kind: string, match: RegExpMatchArray): string | undefined {
  if (kind === "authorization_header") {
    return match[2];
  }
  if (kind === "url_credentials") {
    return match[0];
  }
  return match[1];
}

function looksLikeDummy(value: string): boolean {
  const upperValue = value.toUpperCase();
  return dummyMarkers.some((marker) => upperValue.includes(marker));
}

function dedupeMatches(matches: readonly SensitiveMatch[]): readonly SensitiveMatch[] {
  const sorted = [...matches].sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));
  const deduped: SensitiveMatch[] = [];
  let lastEnd = -1;
  for (const match of sorted) {
    if (match.start < lastEnd) {
      continue;
    }
    deduped.push(match);
    lastEnd = match.end;
  }
  return deduped;
}
