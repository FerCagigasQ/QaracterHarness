import type { StructuredApoloError } from "./errors.js";

export type OutputFormat = "text" | "json";

export interface CommandResult<TData = unknown> {
  readonly ok: true;
  readonly command: string;
  readonly exitCode: 0;
  readonly message?: string;
  readonly data?: TData;
  readonly lines?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface CommandFailure {
  readonly ok: false;
  readonly command?: string;
  readonly exitCode: number;
  readonly error: StructuredApoloError;
}

export type CliResult<TData = unknown> = CommandResult<TData> | CommandFailure;

export function commandOk<TData>(
  command: string,
  options: Omit<CommandResult<TData>, "ok" | "command" | "exitCode"> = {}
): CommandResult<TData> {
  return {
    ok: true,
    command,
    exitCode: 0,
    ...options
  };
}
