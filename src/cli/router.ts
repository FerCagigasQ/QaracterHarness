import { ApoloError } from "./errors.js";
import type { CliContext } from "./context.js";
import { commandOk, type CommandResult } from "../core/results.js";
import { DoctorCommandService } from "./services/doctor.js";
import { loadConfig } from "../config/loader.js";
import { resolveApoloPaths } from "../fs/layout.js";
import { parseInitOptions, runApoloInit, formatInitResult } from "../init/workspace.js";
import { runPlan } from "../planning/cli.js";
import { runMemoryCommand } from "../memory/cli.js";
import { detectAgents } from "../agents/detection.js";
import {
  routeAgents,
  RoutingError,
  parseTaskCapability,
  type RoutingDecision
} from "../agents/routing.js";
import { MAX_AGENTS_PER_TASK, type TaskCapability } from "../agents/catalog.js";
import { runFromPlan } from "../run/orchestrator.js";
import { runSummaryForOutput } from "../run/memory.js";
import type { ApprovalSource, PrProvider, RunMode } from "../run/types.js";

interface CommandEntry {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
}

export const commands: readonly CommandEntry[] = [
  {
    name: "init",
    summary: "Create or update generic APOLO harness artifacts.",
    usage: "apolo init [--dry-run] [--format json|text] [--force]"
  },
  {
    name: "doctor",
    summary: "Inspect local CLI configuration and defaults.",
    usage: "apolo doctor"
  },
  {
    name: "plan",
    summary: "Plan a task before execution.",
    usage: "apolo plan --task \"...\" [--dry-run] [--format json]"
  },
  {
    name: "run",
    summary: "Run an approved task.",
    usage: "apolo run --from-plan <path> --approve [--dry-run|--execute] [--fake-agent]"
  },
  {
    name: "sync",
    summary: "Synchronize local state with repository metadata.",
    usage: "apolo sync"
  },
  {
    name: "memory",
    summary: "Inspect and manage local APOLO memory.",
    usage: "apolo memory <list|search|show|add|export>"
  },
  {
    name: "agents",
    summary: "List detected local agent CLIs and route tasks.",
    usage: "apolo agents [--json] [--route <task>] [--task <kind>] [--require-pr]"
  }
];

export async function dispatch(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const [commandName, ...commandArgs] = args;

  if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
    return commandOk("help", {
      message: formatHelp().trimEnd(),
      data: { commands: commands.map((c) => c.name) }
    });
  }

  const command = commands.find((entry) => entry.name === commandName);

  if (!command) {
    throw new ApoloError(`Unknown command: ${commandName}`, {
      code: "UNKNOWN_COMMAND",
      exitCode: 2,
      hint: "Run `apolo --help` to see available commands."
    });
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    return commandOk(command.name, {
      message: `${command.usage}\n\n${command.summary}${formatCommandOptions(command.name)}`
    });
  }

  switch (command.name) {
    case "init":
      return runInit(commandArgs, context);
    case "doctor":
      return runDoctor(commandArgs, context);
    case "plan":
      return runPlanCommand(commandArgs, context);
    case "run":
      return runTask(commandArgs, context);
    case "sync":
      return runSync(commandArgs, context);
    case "memory":
      return runMemory(commandArgs, context);
    case "agents":
      return runAgents(commandArgs, context);
    default:
      throw new ApoloError(`Command not implemented: ${command.name}`, {
        code: "NOT_IMPLEMENTED",
        exitCode: 64
      });
  }
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
    "  --format     Select text or json output.",
    "  --json       Alias for --format json.",
    "  --verbose    Enable debug logs.",
    "  --quiet      Suppress logs.",
    ""
  ].join("\n");
}

/* ── init ────────────────────────────────────────────────────────── */

async function runInit(args: readonly string[], context: CliContext): Promise<CommandResult> {
  let options;
  try {
    const initArgs = context.outputFormat === "json" && !hasFormatArg(args) ? [...args, "--format", "json"] : args;
    options = parseInitOptions(initArgs);
  } catch (error) {
    throw new ApoloError(error instanceof Error ? error.message : "Invalid apolo init options.", {
      exitCode: 2,
      hint: "Run `apolo init --help` for usage."
    });
  }

  const result = await runApoloInit(context.cwd, context.env, options);

  if (result.summary.conflicts.length > 0) {
    throw new ApoloError("Init completed with unresolved conflicts.", {
      exitCode: 1,
      hint: "Re-run with --force to overwrite, or resolve manually."
    });
  }

  if (context.outputFormat === "json") {
    return commandOk("init", { data: result });
  }

  context.stdout.write(formatInitResult(result, options.format));
  return commandOk("init");
}

/* ── doctor ──────────────────────────────────────────────────────── */

async function runDoctor(args: readonly string[], context: CliContext): Promise<CommandResult> {
  rejectUnexpectedArgs("doctor", args);
  return new DoctorCommandService().execute({ args }, context);
}

/* ── plan ────────────────────────────────────────────────────────── */

async function runPlanCommand(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const planArgs = context.outputFormat === "json" && !hasFormatArg(args) ? [...args, "--format", "json"] : args;
  if (context.outputFormat === "json") {
    let stdout = "";
    const exitCode = await runPlan(planArgs, {
      ...context,
      outputFormat: "json",
      stdout: {
        write: (chunk) => {
          stdout += chunk;
        }
      }
    });
    if (exitCode !== 0) {
      throw new ApoloError("Plan command failed.", { exitCode });
    }
    return commandOk("plan", { data: JSON.parse(stdout) });
  }

  const exitCode = await runPlan(planArgs, context);
  if (exitCode !== 0) {
    throw new ApoloError("Plan command failed.", { exitCode });
  }
  return commandOk("plan");
}

/* ── run ─────────────────────────────────────────────────────────── */

async function runTask(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const parsed = parseRunArgs(args);

  if (!parsed.fromPlan && !parsed.resumeRunId) {
    const approved = await requestHumanApproval(args, context);

    if (!approved.approved) {
      throw new ApoloError("apolo run requires explicit human approval before execution.", {
        exitCode: 2,
        hint: "Pass --approve after reviewing the task, or type approve when prompted."
      });
    }

    throw new ApoloError("apolo run requires --from-plan <path> or --resume <run-id>.", {
      code: "INVALID_ARGUMENTS",
      exitCode: 2,
      hint: "Generate a plan first with `apolo plan --task \"...\"`."
    });
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
      code: "APPROVAL_REQUIRED",
      exitCode: 2,
      hint: "Pass --approve after reviewing the plan, or type approve when prompted."
    });
  }

  if (summary.state === "failed" || summary.state === "verification_failed") {
    throw new ApoloError(`Run ${summary.state}: check ledger at ${summary.ledgerPath}`, {
      exitCode: 1
    });
  }

  return commandOk("run");
}

/* ── sync ────────────────────────────────────────────────────────── */

async function runSync(args: readonly string[], context: CliContext): Promise<CommandResult> {
  rejectUnexpectedArgs("sync", args);
  context.stdout.write("apolo sync: synchronization interface ready.\n");
  return commandOk("sync");
}

/* ── memory ──────────────────────────────────────────────────────── */

async function runMemory(args: readonly string[], context: CliContext): Promise<CommandResult> {
  if (context.outputFormat === "json") {
    const { exitCode, stdout } = await captureCommand((capturedContext) => runMemoryCommand(args, capturedContext), context);
    if (exitCode !== 0) {
      throw new ApoloError("Memory command failed.", { exitCode });
    }
    return commandOk("memory", { data: outputAsData(stdout) });
  }

  const exitCode = await runMemoryCommand(args, context);
  if (exitCode !== 0) {
    throw new ApoloError("Memory command failed.", { exitCode });
  }
  return commandOk("memory");
}

/* ── agents ──────────────────────────────────────────────────────── */

async function runAgents(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const config = await loadConfig(context.cwd, context.env);
  const options = parseAgentsArgs(args);
  const emitJson = context.outputFormat === "json" || options.json;
  const agents = await detectAgents({ env: context.env });
  const routing =
    options.routePrompt !== undefined
      ? routeAgents(
          {
            prompt: options.routePrompt,
            task: options.task,
            requirePr: options.requirePr,
            maxAgents: MAX_AGENTS_PER_TASK,
            preferJson: emitJson
          },
          agents
        )
      : null;
  const data = {
    maxAgentsPerTask: config.manifest.agents.maxPerTask,
    configuredAgents: config.manifest.agents.configured.length,
    agents,
    routing
  };

  if (context.outputFormat === "json") {
    return commandOk("agents", { data });
  }

  if (options.json) {
    context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return commandOk("agents");
  }

  context.stdout.write("APOLO agents\n");
  context.stdout.write(`max per task: ${config.manifest.agents.maxPerTask}\n`);
  context.stdout.write(`configured: ${config.manifest.agents.configured.length}\n`);
  for (const agent of agents) {
    const status = agent.installed ? "installed" : "missing";
    const version = agent.version === null ? "" : ` (${agent.version})`;
    context.stdout.write(`- ${agent.displayName}: ${status}${version}\n`);
    context.stdout.write(`  id: ${agent.id}\n`);
    context.stdout.write(`  capabilities: ${agent.capabilities.tasks.join(", ")}\n`);
    context.stdout.write(`  pr-capable: ${agent.prCapable ? "true" : "false"}\n`);
    if (!agent.installed && agent.missingReason !== null) {
      context.stdout.write(`  missing: ${agent.missingReason}\n`);
    }
  }

  if (routing !== null) {
    writeRouting(routing, context);
  }
  return commandOk("agents");
}

/* ── helpers ─────────────────────────────────────────────────────── */

interface AgentsOptions {
  readonly json: boolean;
  readonly routePrompt?: string | undefined;
  readonly task?: TaskCapability | undefined;
  readonly requirePr: boolean;
}

function parseAgentsArgs(args: readonly string[]): AgentsOptions {
  let json = false;
  let routePrompt: string | undefined;
  let task: ReturnType<typeof parseTaskCapability>;
  let requirePr = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json" || arg === "--format=json" || arg === "--format" || arg === "--route" || arg === "--task") {
      if (arg === "--json" || arg === "--format=json") {
        json = true;
        continue;
      }

      const value = args[index + 1];
      if (value === undefined) {
        throw new ApoloError(`Missing value for ${arg}`, { exitCode: 2 });
      }
      index += 1;

      if (arg === "--format") {
        if (value !== "json" && value !== "text") {
          throw new ApoloError("apolo agents --format must be text or json", { exitCode: 2 });
        }
        json = value === "json";
      } else if (arg === "--route") {
        routePrompt = value;
      } else {
        try {
          task = parseTaskCapability(value);
        } catch (error) {
          if (error instanceof RoutingError) {
            throw new ApoloError(error.message, { exitCode: 2 });
          }
          throw error;
        }
      }
      continue;
    }

    if (arg === "--require-pr") {
      requirePr = true;
      continue;
    }

    throw new ApoloError(`Unknown apolo agents option: ${arg}`, {
      exitCode: 2,
      hint: "Run `apolo agents --help` for usage."
    });
  }

  return { json, routePrompt, task, requirePr };
}

function writeRouting(routing: RoutingDecision, context: CliContext): void {
  context.stdout.write("routing\n");
  context.stdout.write(`task: ${routing.task}\n`);
  context.stdout.write(`coordinator: ${routing.coordinator ?? "none"}\n`);
  context.stdout.write(`selected: ${routing.selectedAgents.map((agent) => agent.id).join(", ")}\n`);
  for (const agent of routing.selectedAgents) {
    context.stdout.write(`- ${agent.id}: ${agent.command.join(" ")}\n`);
    if (agent.machineReadableCommand !== null) {
      context.stdout.write(`  json: ${agent.machineReadableCommand.join(" ")}\n`);
    }
  }
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
    if (arg === "--approve") {
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

async function captureCommand(
  run: (context: CliContext) => Promise<number>,
  context: CliContext
): Promise<{ readonly exitCode: number; readonly stdout: string }> {
  let stdout = "";
  const exitCode = await run({
    ...context,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      }
    }
  });
  return { exitCode, stdout };
}

function outputAsData(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return { output: trimmed };
  }
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
      code: "INVALID_ARGUMENTS",
      exitCode: 2,
      hint: `Run \`apolo ${command} --help\` for usage.`
    });
  }
}

function hasFormatArg(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--json" || arg === "--format" || arg.startsWith("--format="));
}

function formatCommandOptions(command: string): string {
  if (command !== "init") {
    return "";
  }

  return [
    "",
    "Options:",
    "  --dry-run            Show planned changes without writing.",
    "  --format json|text   Select output format.",
    "  --json               Alias for --format json.",
    "  --force              Update APOLO-managed files with managed markers.",
    ""
  ].join("\n");
}
