import { defaultSecretsPolicy, type SecretsPolicy } from "./redaction.js";

export interface ApprovalPolicy {
  readonly humanApprovalRequiredBeforeRun: boolean;
  readonly riskApprovalRequired: boolean;
}

export interface DestructiveOpsPolicy {
  readonly enabled: boolean;
  readonly blockedPatterns: readonly string[];
}

export interface ToolAllowlistPolicy {
  readonly enabled: boolean;
  readonly allowedTools: readonly string[];
}

export interface WriteScopePolicy {
  readonly enabled: boolean;
  readonly allowedPaths: readonly string[];
  readonly deniedPaths: readonly string[];
}

export interface DiffSizePolicy {
  readonly enabled: boolean;
  readonly maxFilesChanged: number;
  readonly maxLinesChanged: number;
  readonly maxSingleFileLinesChanged: number;
}

export interface MemoryWritePolicy {
  readonly enabled: boolean;
  readonly blockSensitiveData: boolean;
  readonly maxValueLength: number;
}

export interface BudgetPolicy {
  readonly enabled: boolean;
  readonly maxToolCalls: number;
  readonly maxRuntimeMinutes: number;
  readonly maxEstimatedCostUsd: number;
}

export interface PermissionPolicy {
  readonly prWriters: readonly string[];
  readonly atlassianWriters: readonly string[];
}

export interface PolicyConfig {
  readonly approval: ApprovalPolicy;
  readonly secrets: SecretsPolicy;
  readonly destructiveOps: DestructiveOpsPolicy;
  readonly toolAllowlist: ToolAllowlistPolicy;
  readonly writeScope: WriteScopePolicy;
  readonly diffSize: DiffSizePolicy;
  readonly memoryWrite: MemoryWritePolicy;
  readonly budget: BudgetPolicy;
  readonly permissions: PermissionPolicy;
}

export const defaultPolicyConfig: PolicyConfig = {
  approval: {
    humanApprovalRequiredBeforeRun: true,
    riskApprovalRequired: true
  },
  secrets: defaultSecretsPolicy,
  destructiveOps: {
    enabled: true,
    blockedPatterns: [
      String.raw`\brm\s+-[^\n]*[rf][^\n]*\s+/`,
      String.raw`\bgit\s+reset\s+--hard\b`,
      String.raw`\bgit\s+clean\s+-[^\n]*[fd][^\n]*\b`,
      String.raw`\bchmod\s+-R\s+777\b`,
      String.raw`\bmkfs(?:\.[a-z0-9]+)?\b`,
      String.raw`\bdd\s+.*\bof=`,
      String.raw`\bdocker\s+system\s+prune\b`,
      String.raw`\bkubectl\s+delete\s+(?:namespace|ns)\b`,
      String.raw`\bterraform\s+destroy\b`,
      String.raw`\bshutdown\b`,
      String.raw`\breboot\b`
    ]
  },
  toolAllowlist: {
    enabled: true,
    allowedTools: [
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
      "update_pr"
    ]
  },
  writeScope: {
    enabled: true,
    allowedPaths: ["src/", "tests/", "docs/", "apolo.yaml", ".apolo/"],
    deniedPaths: [".git/", ".env", ".env.", "id_rsa", "id_ed25519", "credentials"]
  },
  diffSize: {
    enabled: true,
    maxFilesChanged: 20,
    maxLinesChanged: 800,
    maxSingleFileLinesChanged: 300
  },
  memoryWrite: {
    enabled: true,
    blockSensitiveData: true,
    maxValueLength: 4000
  },
  budget: {
    enabled: true,
    maxToolCalls: 100,
    maxRuntimeMinutes: 30,
    maxEstimatedCostUsd: 5
  },
  permissions: {
    prWriters: ["claude", "codex"],
    atlassianWriters: ["claude", "codex"]
  }
};

export function resolvePolicyConfig(config: PartialPolicyConfig = {}): PolicyConfig {
  return {
    approval: { ...defaultPolicyConfig.approval, ...config.approval },
    secrets: { ...defaultPolicyConfig.secrets, ...config.secrets },
    destructiveOps: { ...defaultPolicyConfig.destructiveOps, ...config.destructiveOps },
    toolAllowlist: { ...defaultPolicyConfig.toolAllowlist, ...config.toolAllowlist },
    writeScope: { ...defaultPolicyConfig.writeScope, ...config.writeScope },
    diffSize: { ...defaultPolicyConfig.diffSize, ...config.diffSize },
    memoryWrite: { ...defaultPolicyConfig.memoryWrite, ...config.memoryWrite },
    budget: { ...defaultPolicyConfig.budget, ...config.budget },
    permissions: { ...defaultPolicyConfig.permissions, ...config.permissions }
  };
}

export interface PartialPolicyConfig {
  readonly approval?: Partial<ApprovalPolicy>;
  readonly secrets?: Partial<SecretsPolicy>;
  readonly destructiveOps?: Partial<DestructiveOpsPolicy>;
  readonly toolAllowlist?: Partial<ToolAllowlistPolicy>;
  readonly writeScope?: Partial<WriteScopePolicy>;
  readonly diffSize?: Partial<DiffSizePolicy>;
  readonly memoryWrite?: Partial<MemoryWritePolicy>;
  readonly budget?: Partial<BudgetPolicy>;
  readonly permissions?: Partial<PermissionPolicy>;
}
