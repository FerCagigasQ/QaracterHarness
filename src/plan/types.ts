import type { Env } from "../fs/layout.js";

export type TaskClassification =
  | "bugfix"
  | "feature"
  | "refactor"
  | "test"
  | "documentation"
  | "analysis"
  | "unknown";

export type VerificationType =
  | "lint"
  | "typecheck"
  | "unit-tests"
  | "integration-tests"
  | "manual-review"
  | "build"
  | "none";

export type RiskLevel = "low" | "medium" | "high";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PlanAgent {
  name: string;
  role: string;
  reason: string;
}

export interface PlanStep {
  id: number;
  title: string;
  detail: string;
}

export interface PlanCostEstimate {
  agents: number;
  expectedMinutes: number;
  risk: RiskLevel;
}

export interface PlanRecord {
  id: string;
  createdAt: string;
  task: string;
  classification: TaskClassification;
  uncertainties: string[];
  strategy: string;
  steps: PlanStep[];
  agents: PlanAgent[];
  verifications: VerificationType[];
  cost: PlanCostEstimate;
  likelyFiles: string[];
  approvalStatus: ApprovalStatus;
  sourceFiles: string[];
}

export interface PlanContext {
  cwd: string;
  task: string;
  apoloYaml: string | undefined;
  memory: string | undefined;
  harnessSummary: string | undefined;
  files: string[];
}

export interface GeneratePlanOptions {
  cwd: string;
  env: Env;
  task: string;
  planId?: string;
  now?: Date;
}

export interface PlanGenerationResult {
  record: PlanRecord;
  markdown: string;
  path: string;
  approvalPath: string;
}
