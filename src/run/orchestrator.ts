import { resolve } from "node:path";
import type { Env } from "../fs/layout.js";
import { createExecutor, type AgentExecutor } from "./executor.js";
import { preparePrMetadata } from "./git.js";
import { RunLedger } from "./ledger.js";
import { recordRunMemory } from "./memory.js";
import { loadRunPlan, uniqueAgents } from "./plan.js";
import { evaluateRunSecurity, securityAllowsSideEffects } from "./security.js";
import { runVerification } from "./verification.js";
import type {
  AgentAssignment,
  ApprovalDecision,
  ApprovalSource,
  PrProvider,
  RunFinalState,
  RunMode,
  RunPlan,
  RunSummary
} from "./types.js";

export interface RunOrchestratorOptions {
  readonly cwd: string;
  readonly env: Env;
  readonly planPath?: string;
  readonly resumeRunId?: string;
  readonly approved: boolean;
  readonly approvalSource: ApprovalSource;
  readonly mode: RunMode;
  readonly provider?: PrProvider;
  readonly fakeAgent: boolean;
  readonly executor?: AgentExecutor;
}

const terminalStates: readonly RunFinalState[] = ["failed", "verification_failed", "completed", "needs_review"];

export async function runFromPlan(options: RunOrchestratorOptions): Promise<RunSummary> {
  const ledger = RunLedger.create(options.cwd, options.env, options.resumeRunId);
  await ledger.initialize();
  const checkpoint = options.resumeRunId ? await ledger.readCheckpoint() : undefined;

  if (checkpoint && terminalStates.includes(checkpoint.state)) {
    const plan = await loadRunPlan(checkpoint.planPath);
    const approval = approvalDecision(plan, options.approved, options.approvalSource);
    await ledger.record("run.resume.noop", { state: checkpoint.state }, checkpoint.state);
    return emptySummary(ledger, plan, approval, checkpoint.state);
  }

  const requestedPlanPath = checkpoint?.planPath ?? options.planPath;
  if (!requestedPlanPath) {
    throw new Error("apolo run requires --from-plan <path> or --resume <run-id>.");
  }
  const planPath = resolve(requestedPlanPath);

  await ledger.record(
    checkpoint ? "run.resumed" : "run.created",
    { planPath, mode: options.mode, resumeRunId: options.resumeRunId ?? null },
    "running"
  );
  const plan = await loadRunPlan(planPath);
  await ledger.record("plan.loaded", { planId: plan.id, approved: plan.approved, approvalRequired: plan.approvalRequired });

  const approval = approvalDecision(plan, options.approved, options.approvalSource);
  const security = evaluateRunSecurity(plan, approval);
  await ledger.record("security.checked", {
    decisions: security.map((decision) => ({
      gate: decision.gate,
      allowed: decision.allowed,
      severity: decision.severity,
      reason: decision.reason
    }))
  });

  if (!securityAllowsSideEffects(security)) {
    const onlyApprovalRequired = security.every((decision) => decision.allowed || decision.severity === "approval");
    const state: RunFinalState = onlyApprovalRequired ? "approval_required" : "failed";
    await ledger.record("run.paused", { state }, state);
    await ledger.checkpoint(plan.sourcePath, state);
    return emptySummary(ledger, plan, approval, state);
  }

  const assignments = routeAgents(plan);
  await ledger.record("agents.routed", {
    count: assignments.length,
    agents: assignments.map((assignment) => assignment.agent)
  });
  await ledger.record("execution.started", { mode: options.mode }, "running");

  const executor = options.executor ?? createExecutor(options.mode, options.fakeAgent);
  const executionResults = await executor.execute(plan, assignments, options.cwd);
  await ledger.record("execution.completed", {
    results: executionResults.map((result) => ({
      agent: result.agent,
      stepId: result.stepId,
      status: result.status,
      exitCode: result.exitCode ?? null
    }))
  });

  const verificationResults = await runVerification(options.cwd, plan);
  await ledger.record("verification.completed", {
    passed: verificationResults.every((result) => result.passed),
    count: verificationResults.length
  });

  await recordRunMemory(options.cwd, options.env, plan, executionResults);
  await ledger.record("memory.updated", { planId: plan.id });

  const prMetadata = await preparePrMetadata({
    cwd: options.cwd,
    runDir: ledger.runDir,
    plan,
    provider: options.provider ?? plan.provider,
    executionResults,
    verificationResults
  });
  await ledger.record("pr.prepared", {
    provider: prMetadata.provider,
    branchName: prMetadata.branchName,
    pushPolicy: prMetadata.pushPolicy
  });

  const state = finalState(executionResults, verificationResults);
  await ledger.record("run.finished", { state }, state);
  await ledger.checkpoint(plan.sourcePath, state);

  return {
    runId: ledger.runId,
    state,
    planId: plan.id,
    planPath: plan.sourcePath,
    ledgerPath: ledger.ledgerPath,
    runDir: ledger.runDir,
    approval,
    assignments,
    executionResults,
    verificationResults,
    prMetadata
  };
}

function approvalDecision(plan: RunPlan, approved: boolean, source: ApprovalSource): ApprovalDecision {
  if (plan.approved) {
    return {
      approved: true,
      source: "plan",
      reason: "Plan artifact is already approved."
    };
  }
  if (approved) {
    return {
      approved: true,
      source,
      reason: "Runtime approval was explicitly provided."
    };
  }
  return {
    approved: false,
    source: "none",
    reason: "No plan or runtime approval was provided."
  };
}

function routeAgents(plan: RunPlan): readonly AgentAssignment[] {
  return uniqueAgents(plan.steps).map((agent) => ({
    agent,
    steps: plan.steps.filter((step) => step.agent === agent)
  }));
}

function finalState(
  executionResults: readonly { readonly status: string }[],
  verificationResults: readonly { readonly passed: boolean }[]
): RunFinalState {
  if (executionResults.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (executionResults.some((result) => result.status === "needs_review")) {
    return "needs_review";
  }
  if (verificationResults.some((result) => !result.passed)) {
    return "verification_failed";
  }
  return "completed";
}

function emptySummary(ledger: RunLedger, plan: RunPlan, approval: ApprovalDecision, state: RunFinalState): RunSummary {
  return {
    runId: ledger.runId,
    state,
    planId: plan.id,
    planPath: plan.sourcePath,
    ledgerPath: ledger.ledgerPath,
    runDir: ledger.runDir,
    approval,
    assignments: [],
    executionResults: [],
    verificationResults: []
  };
}
