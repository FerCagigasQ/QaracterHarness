import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureRepoLayout, resolveApoloPaths } from "../fs/layout.js";
import { writePendingApproval } from "./approval.js";
import { buildPlanContext } from "./context.js";
import { renderPlanMarkdown } from "./templates/planMarkdown.js";
import type {
  GeneratePlanOptions,
  PlanAgent,
  PlanContext,
  PlanGenerationResult,
  PlanRecord,
  PlanStep,
  TaskClassification,
  VerificationType,
} from "./types.js";

const keywords = (text: string, values: string[]): boolean =>
  values.some((value) => text.includes(value));

export const classifyTask = (task: string): TaskClassification => {
  const normalized = task.toLowerCase();
  if (keywords(normalized, ["fix", "bug", "error", "fail", "broken"])) {
    return "bugfix";
  }
  if (keywords(normalized, ["test", "coverage", "spec"])) {
    return "test";
  }
  if (keywords(normalized, ["doc", "readme", "guide"])) {
    return "documentation";
  }
  if (keywords(normalized, ["refactor", "cleanup", "rename"])) {
    return "refactor";
  }
  if (keywords(normalized, ["analyze", "analyse", "investigate", "plan"])) {
    return "analysis";
  }
  if (keywords(normalized, ["add", "build", "implement", "create", "feature"])) {
    return "feature";
  }
  return "unknown";
};

const detectUncertainties = (context: PlanContext): string[] => {
  const uncertainties: string[] = [];
  if (!context.apoloYaml) {
    uncertainties.push("apolo.yaml is not present; defaults will be assumed until configured.");
  }
  if (!context.memory) {
    uncertainties.push("No APOLO memory file was found; plan uses repository files only.");
  }
  if (context.files.length === 0) {
    uncertainties.push("Repository has no tracked working files yet.");
  }
  if (context.task.length < 20) {
    uncertainties.push("Task description is brief; acceptance criteria may need human clarification.");
  }
  return uncertainties;
};

const likelyFiles = (context: PlanContext, classification: TaskClassification): string[] => {
  const taskWords = context.task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  const directMatches = context.files.filter((file) => {
    const lower = file.toLowerCase();
    return taskWords.some((word) => lower.includes(word));
  });
  const structuralMatches = context.files.filter((file) => {
    if (classification === "test") {
      return /test|spec/.test(file);
    }
    if (classification === "documentation") {
      return /readme|docs|\.md$/.test(file.toLowerCase());
    }
    return /src|package\.json|pyproject\.toml|apolo\.yaml/.test(file);
  });
  return [...new Set([...directMatches, ...structuralMatches])].slice(0, 12);
};

const suggestAgents = (classification: TaskClassification, files: string[]): PlanAgent[] => {
  const agents: PlanAgent[] = [
    {
      name: "coordinator",
      role: "Claude planning coordinator",
      reason: "Owns read-only decomposition, risk assessment, and final handoff.",
    },
  ];

  if (classification === "bugfix" || classification === "feature" || classification === "refactor") {
    agents.push({
      name: "implementation-scout",
      role: "Codebase scout",
      reason: "Maps likely files and integration seams before execution is approved.",
    });
  }
  if (classification === "test" || files.some((file) => /test|spec/.test(file))) {
    agents.push({
      name: "verification-planner",
      role: "Verification planner",
      reason: "Selects fast checks and evidence needed before a run is accepted.",
    });
  }
  if (classification === "documentation") {
    agents.push({
      name: "docs-reviewer",
      role: "Documentation reviewer",
      reason: "Checks that plan steps and docs changes remain user-facing and concise.",
    });
  }
  if (files.length > 20) {
    agents.push({
      name: "risk-reviewer",
      role: "Risk reviewer",
      reason: "Flags broad repository impact and sequencing risk.",
    });
  }

  return agents.slice(0, 5);
};

const selectVerifications = (classification: TaskClassification, files: string[]): VerificationType[] => {
  const checks = new Set<VerificationType>(["manual-review"]);
  if (files.some((file) => file.endsWith(".ts") || file.endsWith(".tsx") || file === "package.json")) {
    checks.add("typecheck");
    checks.add("unit-tests");
  }
  if (files.some((file) => file.endsWith(".py") || file === "pyproject.toml")) {
    checks.add("unit-tests");
  }
  if (classification !== "documentation" && classification !== "analysis") {
    checks.add("lint");
  }
  if (classification === "feature") {
    checks.add("build");
  }
  return [...checks];
};

const buildSteps = (classification: TaskClassification): PlanStep[] => [
  {
    id: 1,
    title: "Confirm scope and constraints",
    detail: "Read repository configuration, memory, and harness context without modifying files.",
  },
  {
    id: 2,
    title: "Map likely change surface",
    detail: "Inspect likely files and interfaces relevant to the requested task.",
  },
  {
    id: 3,
    title: "Choose execution strategy",
    detail: `Use a ${classification} strategy with small, reviewable edits after approval.`,
  },
  {
    id: 4,
    title: "Define verification evidence",
    detail: "Select checks that must pass before the work is considered complete.",
  },
  {
    id: 5,
    title: "Request human approval",
    detail: "Keep the plan pending until a human explicitly approves execution.",
  },
];

const expectedMinutes = (classification: TaskClassification, uncertainties: string[], files: string[]): number => {
  const base = classification === "documentation" || classification === "analysis" ? 20 : 45;
  return Math.min(240, base + uncertainties.length * 10 + Math.min(files.length, 40));
};

const risk = (classification: TaskClassification, uncertainties: string[], files: string[]): "low" | "medium" | "high" => {
  if (uncertainties.length >= 3 || files.length > 80) {
    return "high";
  }
  if (classification === "feature" || classification === "bugfix" || files.length > 20) {
    return "medium";
  }
  return "low";
};

const planIdFrom = (task: string, now: Date): string => {
  const slug =
    task
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "task";
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `${stamp}-${slug}`;
};

export const buildPlanRecord = (context: PlanContext, planId: string, now: Date): PlanRecord => {
  const classification = classifyTask(context.task);
  const uncertainties = detectUncertainties(context);
  const files = likelyFiles(context, classification);
  const agents = suggestAgents(classification, files);
  const cost = {
    agents: agents.length,
    expectedMinutes: expectedMinutes(classification, uncertainties, files),
    risk: risk(classification, uncertainties, files),
  };

  return {
    id: planId,
    createdAt: now.toISOString(),
    task: context.task,
    classification,
    uncertainties,
    strategy:
      "Use read-only Plan Mode first: inspect context, preserve human approval before execution, then hand off to run only after validation succeeds.",
    steps: buildSteps(classification),
    agents,
    verifications: selectVerifications(classification, context.files),
    cost,
    likelyFiles: files,
    approvalStatus: "pending",
    sourceFiles: context.files,
  };
};

export const generatePlan = async (options: GeneratePlanOptions): Promise<PlanGenerationResult> => {
  const now = options.now ?? new Date();
  const context = await buildPlanContext(options.cwd, options.task);
  const planId = options.planId ?? planIdFrom(options.task, now);
  const record = buildPlanRecord(context, planId, now);
  const markdown = renderPlanMarkdown(record);
  const paths = resolveApoloPaths(options.cwd, options.env);
  const plansDir = paths.plansDir;
  const planPath = path.join(plansDir, `${record.id}.md`);

  await ensureRepoLayout(paths);
  await fs.writeFile(planPath, markdown, "utf8");
  const approvalPath = await writePendingApproval(options.cwd, options.env, record, planPath);

  return { record, markdown, path: planPath, approvalPath };
};
