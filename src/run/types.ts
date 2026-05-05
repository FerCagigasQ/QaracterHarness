export type RunFinalState =
  | "approval_required"
  | "running"
  | "failed"
  | "verification_failed"
  | "completed"
  | "needs_review";

export type RunMode = "dry_run" | "execute";
export type PrProvider = "claude" | "codex";
export type ApprovalSource = "plan" | "flag" | "prompt" | "none";
export type GateSeverity = "approval" | "blocked";
export type ExecutionStatus = "skipped" | "completed" | "failed" | "needs_review";

export interface AgentCommandSpec {
  readonly command: readonly string[];
  readonly cwd?: string;
}

export interface RunPlanStep {
  readonly id: string;
  readonly agent: string;
  readonly action: string;
  readonly sideEffects: boolean;
  readonly commandSpec?: AgentCommandSpec;
}

export interface VerificationSpec {
  readonly name: string;
  readonly command: readonly string[];
}

export interface RunPlan {
  readonly version: number;
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly approvalRequired: boolean;
  readonly approved: boolean;
  readonly maxParallelAgents: number;
  readonly steps: readonly RunPlanStep[];
  readonly verifications: readonly VerificationSpec[];
  readonly provider: PrProvider;
  readonly sourcePath: string;
}

export interface ApprovalDecision {
  readonly approved: boolean;
  readonly source: ApprovalSource;
  readonly reason: string;
}

export interface GateDecision {
  readonly gate: string;
  readonly allowed: boolean;
  readonly reason: string;
  readonly severity: GateSeverity;
}

export interface AgentAssignment {
  readonly agent: string;
  readonly steps: readonly RunPlanStep[];
}

export interface ExecutionResult {
  readonly agent: string;
  readonly stepId: string;
  readonly status: ExecutionStatus;
  readonly summary: string;
  readonly exitCode?: number;
}

export interface VerificationResult {
  readonly name: string;
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly passed: boolean;
}

export interface PrMetadata {
  readonly provider: PrProvider;
  readonly title: string;
  readonly body: string;
  readonly branchName: string;
  readonly baseBranch: string;
  readonly currentBranch: string;
  readonly pushPolicy: "no-direct-main-push";
  readonly path: string;
}

export interface RunSummary {
  readonly runId: string;
  readonly state: RunFinalState;
  readonly planId: string;
  readonly planPath: string;
  readonly ledgerPath: string;
  readonly runDir: string;
  readonly approval: ApprovalDecision;
  readonly assignments: readonly AgentAssignment[];
  readonly executionResults: readonly ExecutionResult[];
  readonly verificationResults: readonly VerificationResult[];
  readonly prMetadata?: PrMetadata;
}

export type {
  AgentAssignment as TsAgentAssignment,
  ExecutionResult as TsExecutionResult,
  RunPlan as TsRunPlan,
  RunSummary as TsRunSummary,
  VerificationResult as TsVerificationResult
};
