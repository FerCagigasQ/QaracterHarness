import { writeFile } from "node:fs/promises";
import { ApoloError } from "./errors.js";
import type { CliContext } from "./context.js";
import { loadConfig } from "../config/loader.js";
import { createDefaultManifest } from "../config/defaults.js";
import { ensureRepoLayout, fileExists, resolveApoloPaths } from "../fs/layout.js";
import { runSummaryForOutput } from "../run/memory.js";
import { runFromPlan } from "../run/orchestrator.js";
import type { ApprovalSource, PrProvider, RunMode } from "../run/types.js";

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
    run: async (_args, context) => writeStub(context, "plan", "planning")
  },
  {
    name: "run",
    summary: "Run an approved task.",
    usage: "apolo run --from-plan <path> --approve [--dry-run|--execute] [--fake-agent]",
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

async function runTask(args: readonly string[], context: CliContext): Promise<number> {
  const parsed = parseRunArgs(args);

  if (!parsed.fromPlan && !parsed.resumeRunId) {
    const approved = await requestHumanApproval(args, context);

    if (!approved.approved) {
      throw new ApoloError("apolo run requires explicit human approval before execution.", {
        exitCode: 2,
        hint: "Pass --approve after reviewing the task, or type approve when prompted."
      });
    }

    await writeStub(context, "run", "task execution");
    return 0;
  }

  const approved = await requestHumanApproval(args, context);
  const summary = await runFromPlan({
    cwd: context.cwd,
    env: context.env,
    approved: approved.approved,
    approvalSource: approved.source,
    mode: parsed.mode,
    fakeAgent: parsed.fakeAgent,
    ...(parsed.fromPlan === undefined ? {} : { planPath: parsed.fromPlan }),
    ...(parsed.resumeRunId === undefined ? {} : { resumeRunId: parsed.resumeRunId }),
    ...(parsed.provider === undefined ? {} : { provider: parsed.provider })
  });

  context.stdout.write(runSummaryForOutput(summary));

  if (summary.state === "approval_required") {
    throw new ApoloError("apolo run requires explicit human approval before execution.", {
      exitCode: 2,
      hint: "Pass --approve after reviewing the plan, or type approve when prompted."
    });
  }

  if (summary.state === "failed" || summary.state === "verification_failed") {
    return 1;
  }

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

interface ParsedRunArgs {
  readonly fromPlan?: string;
  readonly resumeRunId?: string;
  readonly mode: RunMode;
  readonly provider?: PrProvider;
  readonly fakeAgent: boolean;
}

function parseRunArgs(args: readonly string[]): ParsedRunArgs {
  let fromPlan: string | undefined;
  let resumeRunId: string | undefined;
  let mode: RunMode = "dry_run";
  let provider: PrProvider | undefined;
  let fakeAgent = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--from-plan") {
      fromPlan = readFlagValue(args, index, "--from-plan");
      index += 1;
      continue;
    }
    if (arg === "--resume") {
      resumeRunId = readFlagValue(args, index, "--resume");
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      mode = "dry_run";
      continue;
    }
    if (arg === "--execute") {
      mode = "execute";
      continue;
    }
    if (arg === "--fake-agent") {
      fakeAgent = true;
      continue;
    }
    if (arg === "--provider") {
      const value = readFlagValue(args, index, "--provider");
      if (value !== "claude" && value !== "codex") {
        throw new ApoloError(`Unsupported PR provider: ${value}`, {
          exitCode: 2,
          hint: "Use --provider claude or --provider codex."
        });
      }
      provider = value;
      index += 1;
      continue;
    }
  }

  const parsed: ParsedRunArgs = { mode, fakeAgent };
  return {
    ...parsed,
    ...(fromPlan === undefined ? {} : { fromPlan }),
    ...(resumeRunId === undefined ? {} : { resumeRunId }),
    ...(provider === undefined ? {} : { provider })
  };
}

function readFlagValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new ApoloError(`${flag} requires a value.`, {
      exitCode: 2,
      hint: "Run `apolo run --help` for usage."
    });
  }
  return value;
}

async function requestHumanApproval(
  args: readonly string[],
  context: CliContext
): Promise<{ readonly approved: boolean; readonly source: ApprovalSource }> {
  if (args.includes("--approve")) {
    context.logger.info("Human approval recorded from --approve.");
    return { approved: true, source: "flag" };
  }

  if (!context.isInteractive) {
    return { approved: false, source: "none" };
  }

  const answer = await context.readLine("Type approve to run: ");
  return answer.trim().toLowerCase() === "approve"
    ? { approved: true, source: "prompt" }
    : { approved: false, source: "none" };
}

function rejectUnexpectedArgs(command: string, args: readonly string[]): void {
  if (args.length > 0) {
    throw new ApoloError(`apolo ${command} does not accept positional arguments yet.`, {
      exitCode: 2,
      hint: `Run \`apolo ${command} --help\` for usage.`
    });
  }
}
