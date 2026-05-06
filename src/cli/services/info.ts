import { loadConfig } from "../../config/loader.js";
import { commandOk, notImplemented } from "../../core/index.js";
import type { CommandResult, CommandService, CommandServiceContext } from "../../core/index.js";

export interface SimpleCommandInput {
  readonly args: readonly string[];
}

export interface MemoryCommandOutput {
  readonly driver: string;
  readonly global: string;
  readonly repo: string;
}

export interface AgentsCommandOutput {
  readonly maxPerTask: number;
  readonly configured: number;
}

export class MemoryCommandService implements CommandService<SimpleCommandInput, MemoryCommandOutput> {
  async execute(input: SimpleCommandInput, context: CommandServiceContext): Promise<CommandResult<MemoryCommandOutput>> {
    if (input.args[0] && input.args[0] !== "list") {
      throw notImplemented("memory", "The memory workstream");
    }

    const config = await loadConfig(context.cwd, context.env);
    return commandOk("memory", {
      message: "APOLO memory",
      lines: [
        `driver: ${config.manifest.memory.driver}`,
        `global: ${config.manifest.memory.globalPath}`,
        `repo: ${config.manifest.memory.repoPath}`
      ],
      data: {
        driver: config.manifest.memory.driver,
        global: config.manifest.memory.globalPath,
        repo: config.manifest.memory.repoPath
      }
    });
  }
}

export class AgentsCommandService implements CommandService<SimpleCommandInput, AgentsCommandOutput> {
  async execute(input: SimpleCommandInput, context: CommandServiceContext): Promise<CommandResult<AgentsCommandOutput>> {
    if (input.args[0] && input.args[0] !== "list") {
      throw notImplemented("agents", "The agent registry workstream");
    }

    const config = await loadConfig(context.cwd, context.env);
    return commandOk("agents", {
      message: "APOLO agents",
      lines: [
        `max per task: ${config.manifest.agents.maxPerTask}`,
        `configured: ${config.manifest.agents.configured.length}`
      ],
      data: {
        maxPerTask: config.manifest.agents.maxPerTask,
        configured: config.manifest.agents.configured.length
      }
    });
  }
}

export class PlanCommandService implements CommandService<SimpleCommandInput> {
  async execute(_input: SimpleCommandInput, _context: CommandServiceContext): Promise<CommandResult> {
    throw notImplemented("plan", "The planning workstream");
  }
}

export class SyncCommandService implements CommandService<SimpleCommandInput> {
  async execute(_input: SimpleCommandInput, _context: CommandServiceContext): Promise<CommandResult> {
    throw notImplemented("sync", "The synchronization workstream");
  }
}

export class RunCommandService implements CommandService<SimpleCommandInput> {
  async execute(_input: SimpleCommandInput, _context: CommandServiceContext): Promise<CommandResult> {
    throw notImplemented("run", "The run orchestration workstream");
  }
}
