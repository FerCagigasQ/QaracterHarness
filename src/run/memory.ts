import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveApoloPaths, type Env } from "../fs/layout.js";
import type { ExecutionResult, RunPlan, RunSummary } from "./types.js";

export async function recordRunMemory(cwd: string, env: Env, plan: RunPlan, results: readonly ExecutionResult[]): Promise<void> {
  const memoryDir = join(resolveApoloPaths(cwd, env).repoHome, "memory");
  await mkdir(memoryDir, { recursive: true });
  await appendFile(
    join(memoryDir, "runs.jsonl"),
    `${JSON.stringify({
      kind: "run",
      planId: plan.id,
      title: plan.title,
      execution: results.map((result) => ({
        agent: result.agent,
        stepId: result.stepId,
        status: result.status
      })),
      recordedAt: new Date().toISOString()
    })}\n`,
    "utf8"
  );
}

export function runSummaryForOutput(summary: RunSummary): string {
  const lines = [
    `APOLO run state: ${summary.state}`,
    `run id: ${summary.runId}`,
    `plan: ${summary.planId}`,
    `ledger: ${summary.ledgerPath}`,
    `approval: ${summary.approval.source} (${summary.approval.reason})`
  ];
  if (summary.prMetadata) {
    lines.push(`pr metadata: ${summary.prMetadata.path}`);
    lines.push(`branch metadata: ${summary.prMetadata.branchName} -> ${summary.prMetadata.baseBranch}`);
  }
  return `${lines.join("\n")}\n`;
}
