import type { Env } from "../fs/layout.js";
import type { CommandResult } from "./results.js";

export interface CommandServiceContext {
  readonly cwd: string;
  readonly env: Env;
  readonly signal: AbortSignal | undefined;
}

export interface CommandService<TInput, TOutput = unknown> {
  execute(input: TInput, context: CommandServiceContext): Promise<CommandResult<TOutput>>;
}
