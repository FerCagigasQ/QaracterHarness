import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ContextPack, PlanContent, PlannerAdapter } from "./types.js";

const execFileAsync = promisify(execFile);

export function createPlannerAdapter(env: NodeJS.ProcessEnv = process.env): PlannerAdapter {
  if (env.APOLO_PLAN_DISABLE_CLAUDE === "1" || !executableExists("claude", env)) {
    return createDeterministicPlanner();
  }

  return {
    name: "claude-cli",
    createPlan: async (task, contextPack) => {
      try {
        const { stdout } = await execFileAsync("claude", ["--print", buildClaudePrompt(task, contextPack)], {
          timeout: 20_000,
          maxBuffer: 1024 * 1024
        });
        return parseClaudePlan(stdout, task, contextPack);
      } catch {
        return createDeterministicPlanner().createPlan(task, contextPack);
      }
    }
  };
}

function executableExists(executable: string, env: NodeJS.ProcessEnv): boolean {
  const pathValue = env.PATH ?? process.env.PATH ?? "";
  const paths = pathValue.split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const candidates = process.platform === "win32" ? [executable, `${executable}.cmd`, `${executable}.exe`] : [executable];

  for (const directory of paths) {
    for (const candidate of candidates) {
      try {
        accessSync(join(directory, candidate), constants.X_OK);
        return true;
      } catch {
        // Continue searching PATH.
      }
    }
  }

  return false;
}

export function createDeterministicPlanner(): PlannerAdapter {
  return {
    name: "deterministic-fallback",
    createPlan: async (task, contextPack) => createFallbackPlan(task, contextPack)
  };
}

function buildClaudePrompt(task: string, contextPack: ContextPack): string {
  return [
    "Create a read-only APOLO implementation plan as strict JSON.",
    "Required JSON keys: objective, nonGoals, assumptions, risks, probableFiles, agentAllocation, acceptanceCriteria, approvalCheckpoints.",
    "verificationCommands is provided by the caller and should not be invented.",
    "Do not include prose outside JSON.",
    "",
    `Task: ${task}`,
    "",
    "Context pack:",
    JSON.stringify(
      {
        metadata: contextPack.metadata,
        documents: contextPack.documents.map((document) => document.path),
        verificationCommands: contextPack.verificationCommands,
        agents: contextPack.agents,
        approvedMemory: contextPack.approvedMemory.map((memory) => memory.title)
      },
      null,
      2
    )
  ].join("\n");
}

function parseClaudePlan(output: string, task: string, contextPack: ContextPack): PlanContent {
  const json = extractJsonObject(output);
  if (!json) {
    return createFallbackPlan(task, contextPack);
  }

  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) {
    return createFallbackPlan(task, contextPack);
  }

  return {
    objective: readString(parsed, "objective") ?? `Plan the requested task: ${task}`,
    nonGoals: readStringArray(parsed, "nonGoals", ["Do not execute implementation before human approval."]),
    assumptions: readStringArray(parsed, "assumptions", ["Repository context was gathered read-only from local files."]),
    risks: readStringArray(parsed, "risks", ["Implementation details may change after deeper code inspection."]),
    probableFiles: readStringArray(parsed, "probableFiles", probableFiles(contextPack)),
    agentAllocation: readStringArray(parsed, "agentAllocation", agentAllocation(contextPack)).slice(0, 5),
    verificationCommands: contextPack.verificationCommands,
    acceptanceCriteria: readStringArray(parsed, "acceptanceCriteria", [
      "Plan is reviewed and approved before execution.",
      "Verification commands are identified before code changes."
    ]),
    approvalCheckpoints: readStringArray(parsed, "approvalCheckpoints", defaultApprovalCheckpoints())
  };
}

function createFallbackPlan(task: string, contextPack: ContextPack): PlanContent {
  return {
    objective: `Prepare an implementation plan for: ${task}`,
    nonGoals: [
      "Do not mutate repository source files during planning.",
      "Do not execute the implementation or agent run before human approval.",
      "Do not require Python for planning."
    ],
    assumptions: [
      "Planning runs locally from TypeScript/Node only.",
      "Detected verification commands represent the likely validation path.",
      "Configured or locally detected agents are advisory until a human approves execution."
    ],
    risks: [
      "Probable files are heuristic and may change during approved implementation.",
      "Optional planner CLI output may be unavailable, so the deterministic fallback is used.",
      "Approved memory may be absent or intentionally minimal."
    ],
    probableFiles: probableFiles(contextPack),
    agentAllocation: agentAllocation(contextPack),
    verificationCommands: contextPack.verificationCommands,
    acceptanceCriteria: [
      "Plan artifact is written under .apolo/plans only.",
      "Plan includes objective, non-goals, assumptions, risks, probable files, agent allocation, verification commands, acceptance criteria, and approval checkpoints.",
      "A human reviews and approves the plan before `apolo run` or any code mutation."
    ],
    approvalCheckpoints: defaultApprovalCheckpoints()
  };
}

function probableFiles(contextPack: ContextPack): readonly string[] {
  const files = new Set<string>();

  for (const document of contextPack.documents.slice(0, 5)) {
    files.add(document.path);
  }

  if (contextPack.verificationCommands.some((command) => command.command[0] === "npm")) {
    files.add("package.json");
  }

  files.add("src/");
  files.add("tests/");
  return [...files].slice(0, 10);
}

function agentAllocation(contextPack: ContextPack): readonly string[] {
  return contextPack.agents.slice(0, 5).map((agent, index) => {
    const role = index === 0 ? "coordinate planning and approval gates" : "support review or verification analysis";
    return `${agent.name}: ${role}`;
  });
}

function defaultApprovalCheckpoints(): readonly string[] {
  return [
    "Human reviews the generated plan artifact.",
    "Human approves the plan before `apolo run`.",
    "Human approves any source-file mutations proposed during execution.",
    "Human reviews verification results before merge or release."
  ];
}

function extractJsonObject(output: string): string | undefined {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  return start >= 0 && end > start ? output.slice(start, end + 1) : undefined;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(source: Record<string, unknown>, key: string, fallback: readonly string[]): readonly string[] {
  const value = source[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
