import { posix } from "node:path";
import { containsSensitiveData } from "./redaction.js";
import { resolvePolicyConfig, type PartialPolicyConfig, type PolicyConfig } from "./policy.js";

export interface ApprovalContext {
  readonly humanRunApproved: boolean;
  readonly destructiveOpsApproved: boolean;
  readonly toolPolicyApproved: boolean;
  readonly writeScopeApproved: boolean;
  readonly diffApproved: boolean;
  readonly memoryWriteApproved: boolean;
  readonly budgetApproved: boolean;
  readonly syncApproved: boolean;
}

export interface ToolCall {
  readonly name: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface FileWrite {
  readonly path: string;
  readonly content?: string;
}

export interface MemoryWrite {
  readonly key: string;
  readonly value: string;
}

export interface DiffStats {
  readonly filesChanged: number;
  readonly linesChanged: number;
  readonly maxSingleFileLinesChanged: number;
}

export interface BudgetUsage {
  readonly toolCalls: number;
  readonly runtimeMinutes: number;
  readonly estimatedCostUsd: number;
}

export interface SyncSideEffect {
  readonly target: string;
  readonly description?: string;
}

export interface PlanRequest {
  readonly actor: string;
  readonly tools?: readonly ToolCall[];
  readonly commands?: readonly string[];
  readonly fileWrites?: readonly FileWrite[];
  readonly memoryWrites?: readonly MemoryWrite[];
  readonly syncSideEffects?: readonly SyncSideEffect[];
  readonly diff?: Partial<DiffStats>;
  readonly budget?: Partial<BudgetUsage>;
  readonly approvals?: Partial<ApprovalContext>;
}

export interface GateDecision {
  readonly gate: string;
  readonly allowed: boolean;
  readonly reason: string;
  readonly requiresApproval: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const defaultApprovals: ApprovalContext = {
  humanRunApproved: false,
  destructiveOpsApproved: false,
  toolPolicyApproved: false,
  writeScopeApproved: false,
  diffApproved: false,
  memoryWriteApproved: false,
  budgetApproved: false,
  syncApproved: false
};

const defaultDiff: DiffStats = {
  filesChanged: 0,
  linesChanged: 0,
  maxSingleFileLinesChanged: 0
};

const defaultBudget: BudgetUsage = {
  toolCalls: 0,
  runtimeMinutes: 0,
  estimatedCostUsd: 0
};

export class SecurityGateEngine {
  readonly config: PolicyConfig;

  constructor(config: PartialPolicyConfig = {}) {
    this.config = resolvePolicyConfig(config);
  }

  evaluate(request: PlanRequest): readonly GateDecision[] {
    return [
      ...this.checkHumanApproval(request),
      ...this.checkSecrets(request),
      ...this.checkDestructiveOps(request),
      ...this.checkToolAllowlist(request),
      ...this.checkWriteScope(request),
      ...this.checkMemoryWrites(request),
      ...this.checkSyncSideEffects(request),
      ...this.checkBudget(request),
      ...this.checkDiffSize(request),
      ...this.checkPermissions(request)
    ];
  }

  isAllowed(request: PlanRequest): boolean {
    return this.evaluate(request).every((decision) => decision.allowed);
  }

  private checkHumanApproval(request: PlanRequest): readonly GateDecision[] {
    const approvals = resolveApprovals(request.approvals);
    if (this.config.approval.humanApprovalRequiredBeforeRun && !approvals.humanRunApproved) {
      return [
        decision("human_approval", false, "human approval is required before any run", true)
      ];
    }
    return [];
  }

  private checkSecrets(request: PlanRequest): readonly GateDecision[] {
    if (!this.config.secrets.enabled) {
      return [];
    }

    const candidates: [string, string][] = [];
    candidates.push(...(request.commands ?? []).map((command, index) => [`command[${index}]`, command] as [string, string]));
    candidates.push(...(request.fileWrites ?? []).map((item) => [`file_write[${item.path}]`, item.content ?? ""] as [string, string]));
    candidates.push(...(request.memoryWrites ?? []).map((item) => [`memory_write[${item.key}]`, item.value] as [string, string]));
    for (const tool of request.tools ?? []) {
      candidates.push([`tool[${tool.name}]`, JSON.stringify(tool.args ?? {})]);
    }

    const decisions: GateDecision[] = [];
    for (const [location, value] of candidates) {
      const matches = containsSensitiveData(value, this.config.secrets);
      if (matches) {
        decisions.push(decision("secrets", false, "sensitive data detected and blocked", false, { location }));
      }
    }
    return decisions;
  }

  private checkDestructiveOps(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.destructiveOps;
    if (!policy.enabled) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    const decisions: GateDecision[] = [];
    for (const command of request.commands ?? []) {
      for (const pattern of policy.blockedPatterns) {
        if (new RegExp(pattern, "i").test(command)) {
          decisions.push(decision("destructive_ops", approvals.destructiveOpsApproved, "destructive operation requires explicit approval", true, { pattern }));
          break;
        }
      }
    }
    return decisions;
  }

  private checkToolAllowlist(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.toolAllowlist;
    if (!policy.enabled) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    const allowedTools = new Set(policy.allowedTools);
    return (request.tools ?? [])
      .filter((tool) => !allowedTools.has(tool.name))
      .map((tool) => decision("tool_allowlist", approvals.toolPolicyApproved, "tool is not in the configured allowlist", true, { tool: tool.name }));
  }

  private checkWriteScope(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.writeScope;
    if (!policy.enabled) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    const decisions: GateDecision[] = [];
    for (const fileWrite of request.fileWrites ?? []) {
      const normalized = normalizeRelativePath(fileWrite.path);
      const denied = matchesAnyDenied(normalized, policy.deniedPaths);
      const allowed = matchesAnyAllowed(normalized, policy.allowedPaths);
      if (denied || !allowed) {
        decisions.push(decision("write_scope", approvals.writeScopeApproved, "write target is outside the configured scope", true, { path: normalized, denied, allowed }));
      }
    }
    return decisions;
  }

  private checkMemoryWrites(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.memoryWrite;
    if (!policy.enabled) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    const decisions: GateDecision[] = [];
    for (const memoryWrite of request.memoryWrites ?? []) {
      if (memoryWrite.value.length > policy.maxValueLength) {
        decisions.push(decision("memory_write", approvals.memoryWriteApproved, "memory write exceeds configured maximum length", true, { key: memoryWrite.key }));
      }
      if (policy.blockSensitiveData && containsSensitiveData(memoryWrite.value, { ...this.config.secrets, enabled: true })) {
        decisions.push(decision("memory_write", approvals.memoryWriteApproved, "memory write contains sensitive data", true, { key: memoryWrite.key }));
      }
    }
    return decisions;
  }

  private checkSyncSideEffects(request: PlanRequest): readonly GateDecision[] {
    const approvals = resolveApprovals(request.approvals);
    return (request.syncSideEffects ?? []).map((effect) =>
      decision("sync_side_effect", approvals.syncApproved, "sync side effect requires explicit approval", true, { target: effect.target })
    );
  }

  private checkBudget(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.budget;
    if (!policy.enabled) {
      return [];
    }

    const budget = { ...defaultBudget, ...request.budget };
    const overages: Record<string, number> = {};
    if (budget.toolCalls > policy.maxToolCalls) {
      overages.toolCalls = budget.toolCalls;
    }
    if (budget.runtimeMinutes > policy.maxRuntimeMinutes) {
      overages.runtimeMinutes = budget.runtimeMinutes;
    }
    if (budget.estimatedCostUsd > policy.maxEstimatedCostUsd) {
      overages.estimatedCostUsd = budget.estimatedCostUsd;
    }
    if (Object.keys(overages).length === 0) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    return [decision("budget", approvals.budgetApproved, "run exceeds configured budget", true, { overages })];
  }

  private checkDiffSize(request: PlanRequest): readonly GateDecision[] {
    const policy = this.config.diffSize;
    if (!policy.enabled) {
      return [];
    }

    const diff = { ...defaultDiff, ...request.diff };
    const overages: Record<string, number> = {};
    if (diff.filesChanged > policy.maxFilesChanged) {
      overages.filesChanged = diff.filesChanged;
    }
    if (diff.linesChanged > policy.maxLinesChanged) {
      overages.linesChanged = diff.linesChanged;
    }
    if (diff.maxSingleFileLinesChanged > policy.maxSingleFileLinesChanged) {
      overages.maxSingleFileLinesChanged = diff.maxSingleFileLinesChanged;
    }
    if (Object.keys(overages).length === 0) {
      return [];
    }

    const approvals = resolveApprovals(request.approvals);
    return [decision("diff_size", approvals.diffApproved, "diff exceeds configured risk threshold", true, { overages })];
  }

  private checkPermissions(request: PlanRequest): readonly GateDecision[] {
    const actor = request.actor.toLowerCase();
    const decisions: GateDecision[] = [];
    for (const tool of request.tools ?? []) {
      if ((tool.name === "create_pr" || tool.name === "update_pr") && !this.config.permissions.prWriters.includes(actor)) {
        decisions.push(decision("pr_permission", false, "actor is not permitted to create or update PRs", false, { actor: request.actor, tool: tool.name }));
      }
      if (tool.name === "atlassian_write" && !this.config.permissions.atlassianWriters.includes(actor)) {
        decisions.push(decision("atlassian_write_permission", false, "actor is not permitted to perform Atlassian writes", false, { actor: request.actor }));
      }
    }
    return decisions;
  }
}

export function normalizeRelativePath(path: string): string {
  const normalized = posix.normalize(path.replace(/\\/g, "/"));
  const parts = normalized.split("/").filter((part) => part !== "" && part !== ".");
  if (path.startsWith("/") || parts.some((part) => part === "..")) {
    return `../${parts.filter((part) => part !== "..").join("/")}`;
  }
  return parts.join("/");
}

function resolveApprovals(approvals: Partial<ApprovalContext> | undefined): ApprovalContext {
  return { ...defaultApprovals, ...approvals };
}

function matchesAnyAllowed(path: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => matchesAllowedPath(path, candidate));
}

function matchesAnyDenied(path: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => matchesDeniedPath(path, candidate));
}

function matchesAllowedPath(path: string, candidate: string): boolean {
  if (candidate.endsWith("/")) {
    return path === candidate.slice(0, -1) || path.startsWith(candidate);
  }
  return path === candidate || path.startsWith(`${candidate}/`);
}

function matchesDeniedPath(path: string, candidate: string): boolean {
  if (matchesAllowedPath(path, candidate)) {
    return true;
  }
  const normalizedCandidate = candidate.replace(/^\/+|\/+$/g, "");
  if (!normalizedCandidate) {
    return false;
  }
  return path === normalizedCandidate || path.endsWith(`/${normalizedCandidate}`) || path.includes(`/${normalizedCandidate}/`);
}

function decision(gate: string, allowed: boolean, reason: string, requiresApproval: boolean, metadata: Readonly<Record<string, unknown>> = {}): GateDecision {
  return { gate, allowed, reason, requiresApproval, metadata };
}
