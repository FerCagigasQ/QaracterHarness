import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContextPack, GeneratedPlan, PlanContent, PlanOptions, PlannerAdapter } from "./types.js";

export interface CreatePlanArtifactOptions {
  readonly cwd: string;
  readonly plansDir: string;
  readonly options: PlanOptions;
  readonly contextPack: ContextPack;
  readonly planner: PlannerAdapter;
  readonly now?: Date;
}

export async function createPlanArtifact(options: CreatePlanArtifactOptions): Promise<GeneratedPlan> {
  const createdAt = (options.now ?? new Date()).toISOString();
  const id = `${timestampId(createdAt)}-${slugify(options.options.task)}`;
  const artifactPath = join(options.plansDir, `${id}.md`);
  const plan = await options.planner.createPlan(options.options.task, options.contextPack);
  const generatedPlan: GeneratedPlan = {
    id,
    task: options.options.task,
    createdAt,
    planner: options.planner.name,
    artifactPath,
    dryRun: options.options.dryRun,
    context: options.contextPack,
    plan: normalizePlan(plan)
  };

  if (!options.options.dryRun) {
    await mkdir(options.plansDir, { recursive: true });
    await writeFile(artifactPath, renderPlanMarkdown(generatedPlan), "utf8");
  }

  return generatedPlan;
}

export function renderPlanMarkdown(generatedPlan: GeneratedPlan): string {
  const commandList = generatedPlan.plan.verificationCommands.length > 0
    ? generatedPlan.plan.verificationCommands.map((command) => `- \`${command.command.join(" ")}\` (${command.name})`).join("\n")
    : "- No verification commands detected.";
  const memoryList = generatedPlan.context.approvedMemory.length > 0
    ? generatedPlan.context.approvedMemory.map((memory) => `- ${memory.title} (${memory.source})`).join("\n")
    : "- No approved memory available.";

  return [
    `# APOLO plan: ${generatedPlan.task}`,
    "",
    `- Plan ID: ${generatedPlan.id}`,
    `- Created: ${generatedPlan.createdAt}`,
    `- Planner: ${generatedPlan.planner}`,
    `- Approval required before run: yes`,
    "",
    "## Objective",
    generatedPlan.plan.objective,
    "",
    "## Non-goals",
    bulletList(generatedPlan.plan.nonGoals),
    "",
    "## Assumptions",
    bulletList(generatedPlan.plan.assumptions),
    "",
    "## Risks",
    bulletList(generatedPlan.plan.risks),
    "",
    "## Probable files",
    bulletList(generatedPlan.plan.probableFiles),
    "",
    "## Agent allocation (max 5)",
    bulletList(generatedPlan.plan.agentAllocation),
    "",
    "## Verification commands",
    commandList,
    "",
    "## Acceptance criteria",
    bulletList(generatedPlan.plan.acceptanceCriteria),
    "",
    "## Approval checkpoints",
    bulletList(generatedPlan.plan.approvalCheckpoints),
    "",
    "## Context pack summary",
    "### Repository metadata",
    bulletList(generatedPlan.context.metadata),
    "",
    "### Documents read",
    generatedPlan.context.documents.map((document) => `- ${document.path}`).join("\n") || "- None detected.",
    "",
    "### Agents",
    generatedPlan.context.agents.map((agent) => `- ${agent.name}: ${agent.description} (${agent.source}, ${agent.available ? "available" : "not detected"})`).join("\n"),
    "",
    "### Approved memory",
    memoryList,
    ""
  ].join("\n");
}

function normalizePlan(plan: PlanContent): PlanContent {
  return {
    ...plan,
    agentAllocation: plan.agentAllocation.slice(0, 5)
  };
}

function bulletList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";
}

function timestampId(createdAt: string): string {
  return createdAt.replace(/\D/gu, "").slice(0, 14);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug || "task";
}
