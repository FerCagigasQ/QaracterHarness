import { writeFile } from "node:fs/promises";
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
    usage: "apolo run <task> --approve",
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
    summary: "List detected local agent CLIs and route tasks.",
    usage: "apolo agents [--json] [--route <task>] [--task <kind>] [--require-pr]",
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
      exitCode: 2,
      hint: `Run \`apolo ${command} --help\` for usage.`
    });
  }
}
