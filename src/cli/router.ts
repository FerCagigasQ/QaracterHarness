import { writeFile } from "node:fs/promises";
import { ApoloError } from "./errors.js";
import type { CliContext } from "./context.js";
import { loadConfig } from "../config/loader.js";
import { createDefaultManifest } from "../config/defaults.js";
import { ensureRepoLayout, fileExists, resolveApoloPaths } from "../fs/layout.js";
import { setApprovalStatus } from "../plan/approval.js";
import { generatePlan } from "../plan/generator.js";
import { validateRunFromPlan } from "../run/fromPlan.js";

export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly run: (args: readonly string[], context: CliContext) => Promise<number>;
}

export const commands: readonly Command[] = [
  {
    name: "init",
    summary: "Create the local APOLO filesystem layout and manifest.",
    usage: "apolo init",
    run: runInit
  },
  {
    name: "doctor",
    summary: "Inspect local CLI configuration and defaults.",
    usage: "apolo doctor",
    run: runDoctor
  },
  {
    name: "plan",
    summary: "Plan a task before execution.",
    usage: "apolo plan <task>",
    run: runPlan
  },
  {
    name: "approve",
    summary: "Approve a generated plan.",
    usage: "apolo approve <plan-id>",
    run: (args, context) => updatePlanApproval(args, context, "approved")
  },
  {
    name: "reject",
    summary: "Reject a generated plan.",
    usage: "apolo reject <plan-id>",
    run: (args, context) => updatePlanApproval(args, context, "rejected")
  },
  {
    name: "run",
    summary: "Run an approved task.",
    usage: "apolo run --from-plan <plan-id>",
    run: runTask
  },
  {
    name: "sync",
    summary: "Synchronize local state with repository metadata.",
    usage: "apolo sync",
    run: async (_args, context) => writeStub(context, "sync", "synchronization")
  },
  {
    name: "memory",
    summary: "Inspect local SQLite memory locations.",
    usage: "apolo memory",
    run: runMemory
  },
  {
    name: "agents",
    summary: "List configured agent slots.",
    usage: "apolo agents",
    run: runAgents
  }
];

export async function dispatch(args: readonly string[], context: CliContext): Promise<number> {
  const [commandName, ...commandArgs] = args;

  if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
    context.stdout.write(formatHelp());
    return 0;
  }

  const command = commands.find((entry) => entry.name === commandName);

  if (!command) {
    throw new ApoloError(`Unknown command: ${commandName}`, {
      exitCode: 2,
      hint: "Run `apolo --help` to see available commands."
    });
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    context.stdout.write(`${command.usage}\n\n${command.summary}\n`);
    return 0;
  }

  return command.run(commandArgs, context);
}

export function formatHelp(): string {
  const commandLines = commands
    .map((command) => `  apolo ${command.name.padEnd(8)} ${command.summary}`)
    .join("\n");

  return [
    "APOLO-CLI",
    "",
    "Usage:",
    "  apolo <command> [options]",
    "",
    "Commands:",
    commandLines,
    "",
    "Global options:",
    "  --help       Show help.",
    "  --verbose    Enable debug logs.",
    "  --quiet      Suppress logs.",
    ""
  ].join("\n");
}

async function runInit(args: readonly string[], context: CliContext): Promise<number> {
  rejectUnexpectedArgs("init", args);

  const paths = resolveApoloPaths(context.cwd, context.env);
  await ensureRepoLayout(paths);

  if (await fileExists(paths.manifestPath)) {
    context.stdout.write(`APOLO workspace already initialized at ${paths.repoHome}\n`);
    return 0;
  }

  const manifest = createDefaultManifest(context.cwd, context.env);
  await writeFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  context.stdout.write(`Initialized APOLO workspace at ${paths.repoHome}\n`);
  context.stdout.write("Default init mode: pull-request\n");
  return 0;
}

async function runDoctor(args: readonly string[], context: CliContext): Promise<number> {
  rejectUnexpectedArgs("doctor", args);

  const config = await loadConfig(context.cwd, context.env);
  const paths = resolveApoloPaths(context.cwd, context.env);
  const manifestExists = await fileExists(paths.manifestPath);

  context.stdout.write("APOLO doctor\n");
  context.stdout.write(`cwd: ${context.cwd}\n`);
  context.stdout.write(`manifest: ${manifestExists ? paths.manifestPath : "not initialized"}\n`);
  context.stdout.write(`config: ${config.configPath ?? "defaults"}\n`);
  context.stdout.write(`coordinator: ${config.manifest.coordinator.provider}\n`);
  context.stdout.write(`approval: ${config.manifest.coordinator.approval}\n`);
  context.stdout.write(`ollama default model: ${config.manifest.models.ollama.defaultModel}\n`);
  context.stdout.write(`max agents per task: ${config.manifest.agents.maxPerTask}\n`);
  context.stdout.write(`global memory: ${config.manifest.memory.globalPath}\n`);
  context.stdout.write(`repo memory: ${config.manifest.memory.repoPath}\n`);
  return 0;
}

async function runPlan(args: readonly string[], context: CliContext): Promise<number> {
  const task = args.join(" ").trim();
  if (!task) {
    throw new ApoloError("apolo plan requires a task description.", {
      exitCode: 2,
      hint: "Run `apolo plan \"your task\"` to create a read-only plan."
    });
  }

  const result = await generatePlan({ cwd: context.cwd, env: context.env, task });
  context.stdout.write(`Plan written: ${result.path}\n`);
  context.stdout.write(`Approval pending: ${result.approvalPath}\n`);
  context.stdout.write(`Next: apolo approve ${result.record.id}\n`);
  return 0;
}

async function updatePlanApproval(
  args: readonly string[],
  context: CliContext,
  status: "approved" | "rejected"
): Promise<number> {
  const planId = requireSingleArgument(status === "approved" ? "approve" : "reject", args);
  const approval = await setApprovalStatus(context.cwd, context.env, planId, status);
  context.stdout.write(`Plan ${approval.planId} is ${approval.status}.\n`);
  return 0;
}

async function runTask(args: readonly string[], context: CliContext): Promise<number> {
  if (args[0] === "--from-plan") {
    const planId = args[1];
    if (!planId || args.length > 2) {
      throw new ApoloError("apolo run --from-plan requires exactly one plan id.", {
        exitCode: 2,
        hint: "Run `apolo run --from-plan <plan-id>` after approving the plan."
      });
    }
    const handoff = await validateRunFromPlan(context.cwd, context.env, planId);
    context.stdout.write(`Run handoff validated for plan ${handoff.planId}.\n`);
    context.stdout.write("Executor integration point reached; full run execution is out of scope.\n");
    return 0;
  }

  const approved = await requestHumanApproval(args, context);

  if (!approved) {
    throw new ApoloError("apolo run requires explicit human approval before execution.", {
      exitCode: 2,
      hint: "Pass --approve after reviewing the task, or type approve when prompted."
    });
  }

  await writeStub(context, "run", "task execution");
  return 0;
}

async function runMemory(args: readonly string[], context: CliContext): Promise<number> {
  rejectUnexpectedArgs("memory", args);

  const config = await loadConfig(context.cwd, context.env);
  context.stdout.write("APOLO memory\n");
  context.stdout.write(`driver: ${config.manifest.memory.driver}\n`);
  context.stdout.write(`global: ${config.manifest.memory.globalPath}\n`);
  context.stdout.write(`repo: ${config.manifest.memory.repoPath}\n`);
  return 0;
}

async function runAgents(args: readonly string[], context: CliContext): Promise<number> {
  rejectUnexpectedArgs("agents", args);

  const config = await loadConfig(context.cwd, context.env);
  context.stdout.write("APOLO agents\n");
  context.stdout.write(`max per task: ${config.manifest.agents.maxPerTask}\n`);
  context.stdout.write(`configured: ${config.manifest.agents.configured.length}\n`);
  return 0;
}

async function writeStub(context: CliContext, command: string, capability: string): Promise<number> {
  context.stdout.write(`apolo ${command}: ${capability} interface ready; implementation pending.\n`);
  return 0;
}

async function requestHumanApproval(args: readonly string[], context: CliContext): Promise<boolean> {
  if (args.includes("--approve")) {
    context.logger.info("Human approval recorded from --approve.");
    return true;
  }

  if (!context.isInteractive) {
    return false;
  }

  const answer = await context.readLine("Type approve to run: ");
  return answer.trim().toLowerCase() === "approve";
}

function rejectUnexpectedArgs(command: string, args: readonly string[]): void {
  if (args.length > 0) {
    throw new ApoloError(`apolo ${command} does not accept positional arguments yet.`, {
      exitCode: 2,
      hint: `Run \`apolo ${command} --help\` for usage.`
    });
  }
}

function requireSingleArgument(command: string, args: readonly string[]): string {
  if (args.length !== 1 || !args[0]) {
    throw new ApoloError(`apolo ${command} requires exactly one plan id.`, {
      exitCode: 2,
      hint: `Run \`apolo ${command} <plan-id>\`.`
    });
  }
  return args[0];
}
