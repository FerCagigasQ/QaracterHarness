import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentCommandSpec, PrProvider, RunPlan, RunPlanStep, VerificationSpec } from "./types.js";

export async function loadRunPlan(planPath: string): Promise<RunPlan> {
  const resolvedPath = resolve(planPath);
  const content = await readFile(resolvedPath, "utf8");
  const trimmed = content.trimStart();
  const plan = trimmed.startsWith("{")
    ? normalizeJsonPlan(JSON.parse(content), resolvedPath)
    : normalizeMarkdownPlan(content, resolvedPath);
  return validatePlan(plan);
}

function normalizeJsonPlan(parsed: unknown, sourcePath: string): RunPlan {
  if (!isRecord(parsed)) {
    throw new Error(`Plan artifact ${sourcePath} must contain a JSON object.`);
  }

  const id = readFirstString(parsed, ["id", "planId"]);
  const objective = readFirstString(parsed, ["objective", "task", "description"], readFirstString(parsed, ["title"], id));
  const title = readFirstString(parsed, ["title"], objective);
  const approvalStatus = readFirstString(parsed, ["approvalStatus", "status"], "pending");
  const approved = parsed.approved === true || approvalStatus === "approved";
  const approvalRequired = parsed.approvalRequired === false ? false : true;
  const provider = readProvider(parsed);
  const steps = readSteps(parsed, objective);
  const agentsFromPlan = readAgentsFromPlan(parsed);
  const maxParallelAgents = readPositiveInteger(parsed, "maxParallelAgents") ?? (agentsFromPlan.length || uniqueAgents(steps).length || 1);
  const verifications = readVerificationSpecs(parsed);

  return {
    version: readPositiveInteger(parsed, "version") ?? 1,
    id,
    title,
    objective,
    approvalRequired,
    approved,
    maxParallelAgents,
    steps,
    verifications,
    provider,
    sourcePath
  };
}

function normalizeMarkdownPlan(markdown: string, sourcePath: string): RunPlan {
  const frontMatter = parseFrontMatter(markdown);
  const id = readFirstString(frontMatter, ["id", "planId"]);
  const objective = readFirstString(frontMatter, ["task", "objective", "title"], id);
  const title = readFirstString(frontMatter, ["title"], objective);
  const approvalStatus = readFirstString(frontMatter, ["approvalStatus", "status"], "pending");
  const approved = approvalStatus === "approved";
  const stepsSection = extractSection(markdown, "Steps");
  const stepActions = parseMarkdownList(stepsSection);
  const steps = stepActions.length === 0
    ? [defaultStep(objective)]
    : stepActions.map((action, index) => ({
        id: `step-${index + 1}`,
        agent: `agent-${Math.min(index + 1, 5)}`,
        action,
        sideEffects: true
      }));

  return {
    version: 1,
    id,
    title,
    objective,
    approvalRequired: true,
    approved,
    maxParallelAgents: Math.min(uniqueAgents(steps).length || 1, 5),
    steps,
    verifications: [],
    provider: "claude",
    sourcePath
  };
}

function validatePlan(plan: RunPlan): RunPlan {
  if (plan.id.length === 0) {
    throw new Error("Plan id is required.");
  }
  if (plan.steps.length === 0) {
    throw new Error(`Plan ${plan.id} must include at least one step.`);
  }
  if (plan.maxParallelAgents < 1) {
    throw new Error(`Plan ${plan.id} must request at least one agent.`);
  }
  return plan;
}

function readSteps(source: Record<string, unknown>, objective: string): readonly RunPlanStep[] {
  const rawSteps = source.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return [defaultStep(objective)];
  }

  return rawSteps.map((step, index) => {
    if (!isRecord(step)) {
      throw new Error(`Plan step ${index + 1} must be an object.`);
    }
    const action = readFirstString(step, ["action", "title", "detail", "task"], objective);
    const agent = readFirstString(step, ["agent", "agentId", "name"], `agent-${Math.min(index + 1, 5)}`);
    const commandSpec = readCommandSpec(step);
    const normalized = {
      id: readFirstString(step, ["id"], `step-${index + 1}`),
      agent,
      action,
      sideEffects: step.sideEffects === false ? false : true
    };
    return commandSpec === undefined ? normalized : { ...normalized, commandSpec };
  });
}

function defaultStep(objective: string): RunPlanStep {
  return {
    id: "step-1",
    agent: "agent-1",
    action: objective,
    sideEffects: true
  };
}

function readCommandSpec(source: Record<string, unknown>): AgentCommandSpec | undefined {
  const rawSpec = source.commandSpec;
  if (isRecord(rawSpec)) {
    const rawCommand = rawSpec.command;
    if (Array.isArray(rawCommand) && rawCommand.every((part) => typeof part === "string")) {
      const cwd = typeof rawSpec.cwd === "string" ? rawSpec.cwd : undefined;
      return cwd === undefined ? { command: rawCommand } : { command: rawCommand, cwd };
    }
  }

  const rawCommand = source.command;
  if (Array.isArray(rawCommand) && rawCommand.every((part) => typeof part === "string")) {
    return { command: rawCommand };
  }

  return undefined;
}

function readVerificationSpecs(source: Record<string, unknown>): readonly VerificationSpec[] {
  const raw = source.verifications;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item, index): VerificationSpec[] => {
    if (isRecord(item)) {
      const command = item.command;
      if (Array.isArray(command) && command.every((part) => typeof part === "string")) {
        return [
          {
            name: readFirstString(item, ["name"], `verification-${index + 1}`),
            command
          }
        ];
      }
    }
    return [];
  });
}

function readAgentsFromPlan(source: Record<string, unknown>): readonly string[] {
  const raw = source.agents;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((agent): string[] => {
    if (typeof agent === "string") {
      return [agent];
    }
    if (isRecord(agent)) {
      const name = readFirstString(agent, ["name", "id"], "");
      return name.length === 0 ? [] : [name];
    }
    return [];
  });
}

export function uniqueAgents(steps: readonly RunPlanStep[]): readonly string[] {
  return [...new Set(steps.map((step) => step.agent))];
}

function readProvider(source: Record<string, unknown>): PrProvider {
  const provider = readFirstString(source, ["provider", "prProvider", "coordinator"], "claude");
  if (provider === "claude" || provider === "codex") {
    return provider;
  }
  throw new Error(`Unsupported PR provider: ${provider}. Expected claude or codex.`);
}

function readPositiveInteger(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return undefined;
}

function readFirstString(source: Record<string, unknown>, keys: readonly string[], fallback?: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required string field: ${keys.join(" or ")}`);
}

function parseFrontMatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match?.[1]) {
    throw new Error("Plan markdown is missing YAML front matter.");
  }
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) {
          throw new Error(`Invalid front matter line: ${line}`);
        }
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

function extractSection(markdown: string, heading: string): string {
  const match = markdown.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |\\s*$)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function parseMarkdownList(section: string): readonly string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
