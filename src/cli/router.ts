import { ApoloError } from "./errors.js";
import type { CliContext } from "./context.js";
import { loadConfig } from "../config/loader.js";
import { createDefaultManifest } from "../config/defaults.js";
import { ensureRepoLayout, fileExists, resolveApoloPaths } from "../fs/layout.js";
import { runPlan } from "../planning/cli.js";

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
    summary: "List configured agent slots.",
    usage: "apolo agents",
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

async function runMemory(args: readonly string[], context: CliContext): Promise<CommandResult> {
  return new MemoryCommandService().execute({ args }, context);
}

async function runAgents(args: readonly string[], context: CliContext): Promise<CommandResult> {
  return new AgentsCommandService().execute({ args }, context);
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
