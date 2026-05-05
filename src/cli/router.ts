import { ApoloError } from "./errors.js";
import type { CliContext } from "./context.js";
import { loadConfig } from "../config/loader.js";
import { createDefaultManifest } from "../config/defaults.js";
import { ensureRepoLayout, fileExists, resolveApoloPaths } from "../fs/layout.js";
import { detectAgents } from "../agents/detection.js";
import {
  RoutingError,
  parseTaskCapability,
  routeAgents,
  type RoutingDecision
} from "../agents/routing.js";
import { MAX_AGENTS_PER_TASK, type AgentId, type TaskCapability } from "../agents/catalog.js";

export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly usage: string;
  readonly run: (args: readonly string[], context: CliContext) => Promise<CommandResult>;
}

export const commands: readonly Command[] = [
  {
    name: "init",
    summary: "Create or update generic APOLO harness artifacts.",
    usage: "apolo init [--dry-run] [--format json|text] [--force]",
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
    usage: "apolo plan --task \"...\" [--dry-run] [--format json]",
    run: runPlan
  },
  {
    name: "run",
    summary: "Run an approved task.",
    usage: "apolo run <task> --approve",
    run: runTask
  },
  {
    name: "sync",
    summary: "Synchronize local state with repository metadata.",
    usage: "apolo sync",
    run: runSync
  },
  {
    name: "memory",
    summary: "Inspect local SQLite memory locations.",
    usage: "apolo memory",
    run: runMemory
  },
  {
    name: "agents",
    summary: "List detected local agent CLIs and route tasks.",
    usage: "apolo agents [--json] [--route <task>] [--task <kind>] [--require-pr]",
    run: runAgents
  }
];

export async function dispatch(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const [commandName, ...commandArgs] = args;

  if (!commandName || commandName === "help" || commandName === "--help" || commandName === "-h") {
    return {
      ok: true,
      command: "help",
      exitCode: 0,
      message: formatHelp().trimEnd(),
      data: {
        commands: commands.map((command) => command.name)
      }
    };
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
    context.stdout.write(`${command.usage}\n\n${command.summary}\n${formatCommandOptions(command.name)}`);
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
    "  --format     Select text or json output.",
    "  --json       Alias for --format json.",
    "  --verbose    Enable debug logs.",
    "  --quiet      Suppress logs.",
    ""
  ].join("\n");
}

async function runInit(args: readonly string[], context: CliContext): Promise<number> {
  let options;
  try {
    options = parseInitOptions(args);
  } catch (error) {
    throw new ApoloError(error instanceof Error ? error.message : "Invalid apolo init options.", {
      exitCode: 2,
      hint: "Run `apolo init --help` for usage."
    });
  }

  const result = await runApoloInit(context.cwd, context.env, options);
  context.stdout.write(formatInitResult(result, options.format));
  return result.summary.conflicts.length > 0 ? 1 : 0;
}

async function runDoctor(args: readonly string[], context: CliContext): Promise<CommandResult> {
  rejectUnexpectedArgs("doctor", args);
  return new DoctorCommandService().execute({ args }, context);
}

async function runPlan(args: readonly string[], context: CliContext): Promise<CommandResult> {
  return new PlanCommandService().execute({ args }, context);
}

async function runTask(args: readonly string[], context: CliContext): Promise<CommandResult> {
  const approved = await requestHumanApproval(args, context);

  if (!approved) {
    throw new ApoloError("apolo run requires explicit human approval before execution.", {
      code: "APPROVAL_REQUIRED",
      exitCode: 2,
      hint: "Pass --approve after reviewing the task, or type approve when prompted."
    });
  }

  return new RunCommandService().execute({ args }, context);
}

async function runSync(args: readonly string[], context: CliContext): Promise<CommandResult> {
  return new SyncCommandService().execute({ args }, context);
}

async function runAgents(args: readonly string[], context: CliContext): Promise<number> {
  const config = await loadConfig(context.cwd, context.env);
  const options = parseAgentsArgs(args);
  const agents = await detectAgents({ env: context.env });
  const routing =
    options.routePrompt !== undefined
      ? routeAgents(
          {
            prompt: options.routePrompt,
            task: options.task,
            requirePr: options.requirePr,
            maxAgents: MAX_AGENTS_PER_TASK,
            preferJson: options.json
          },
          agents
        )
      : null;

  if (options.json) {
    context.stdout.write(
      `${JSON.stringify(
        {
          maxAgentsPerTask: config.manifest.agents.maxPerTask,
          configuredAgents: config.manifest.agents.configured.length,
          agents,
          routing
        },
        null,
        2
      )}\n`
    );
    return 0;
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
  return 0;
}

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
      code: "INVALID_ARGUMENTS",
      exitCode: 2,
      hint: `Run \`apolo ${command} --help\` for usage.`
    });
  }
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
