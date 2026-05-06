import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExecutionResult, PrMetadata, PrProvider, RunPlan, VerificationResult } from "./types.js";

export async function preparePrMetadata(options: {
  readonly cwd: string;
  readonly runDir: string;
  readonly plan: RunPlan;
  readonly provider: PrProvider;
  readonly executionResults: readonly ExecutionResult[];
  readonly verificationResults: readonly VerificationResult[];
}): Promise<PrMetadata> {
  const currentBranch = (await gitOutput(options.cwd, ["branch", "--show-current"])) || "unknown";
  const baseBranch = currentBranch === "main" || currentBranch === "master" ? currentBranch : "main";
  const branchName = `apolo/run/${slug(options.plan.id)}`;
  const diffStat = await gitOutput(options.cwd, ["diff", "--stat"]);
  const checks = options.verificationResults.length === 0
    ? "- No verification commands detected."
    : options.verificationResults
        .map((result) => `- ${result.passed ? "PASS" : "FAIL"} \`${result.name}\`: \`${result.command.join(" ")}\``)
        .join("\n");
  const execution = options.executionResults
    .map((result) => `- ${result.status.toUpperCase()} ${result.agent}/${result.stepId}: ${result.summary}`)
    .join("\n");
  const metadataPath = join(options.runDir, "pr.json");
  const metadata: PrMetadata = {
    provider: options.provider,
    title: options.plan.title,
    body: [
      "## Summary",
      `- Objective: ${options.plan.objective}`,
      `- Plan: ${options.plan.id}`,
      "",
      "## Execution",
      execution || "- No execution results.",
      "",
      "## Verification",
      checks,
      "",
      "## Diff metadata",
      diffStat || "- No git diff detected.",
      "",
      "## Approval",
      "- Human approval was required before side effects."
    ].join("\n"),
    branchName,
    baseBranch,
    currentBranch,
    pushPolicy: "no-direct-main-push",
    path: metadataPath
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise) => {
    let stdout = "";
    const child = spawn("git", args, {
      cwd,
      shell: false,
      env: process.env
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolvePromise(""));
    child.on("close", (code) => resolvePromise(code === 0 ? stdout.trim() : ""));
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
}
