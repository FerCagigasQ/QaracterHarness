export type PlanOutputFormat = "text" | "json";

export interface PlanOptions {
  readonly task: string;
  readonly dryRun: boolean;
  readonly format: PlanOutputFormat;
}

export interface VerificationCommand {
  readonly name: string;
  readonly command: readonly string[];
}

export interface DetectedAgent {
  readonly name: string;
  readonly description: string;
  readonly source: "configured" | "detected" | "default";
  readonly available: boolean;
}

export interface ApprovedMemory {
  readonly title: string;
  readonly body: string;
  readonly source: "repo" | "markdown";
}

export interface ContextPack {
  readonly projectName: string;
  readonly root: string;
  readonly metadata: readonly string[];
  readonly documents: readonly {
    readonly path: string;
    readonly excerpt: string;
  }[];
  readonly verificationCommands: readonly VerificationCommand[];
  readonly agents: readonly DetectedAgent[];
  readonly approvedMemory: readonly ApprovedMemory[];
}

export interface PlanContent {
  readonly objective: string;
  readonly nonGoals: readonly string[];
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
  readonly probableFiles: readonly string[];
  readonly agentAllocation: readonly string[];
  readonly verificationCommands: readonly VerificationCommand[];
  readonly acceptanceCriteria: readonly string[];
  readonly approvalCheckpoints: readonly string[];
}

export interface GeneratedPlan {
  readonly id: string;
  readonly task: string;
  readonly createdAt: string;
  readonly planner: "claude-cli" | "deterministic-fallback";
  readonly artifactPath: string;
  readonly dryRun: boolean;
  readonly context: ContextPack;
  readonly plan: PlanContent;
}

export interface PlannerAdapter {
  readonly name: "claude-cli" | "deterministic-fallback";
  readonly createPlan: (task: string, contextPack: ContextPack) => Promise<PlanContent>;
}
