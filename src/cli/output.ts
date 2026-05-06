import { ApoloError, toStructuredError } from "../core/errors.js";
import type { CliResult, CommandResult, OutputFormat } from "../core/results.js";
import type { Writer } from "./logger.js";

export function writeCommandResult(result: CommandResult, writer: Writer, format: OutputFormat): void {
  if (format === "json") {
    writer.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (result.message) {
    writer.write(`${result.message}\n`);
  }

  for (const line of result.lines ?? []) {
    writer.write(`${line}\n`);
  }

  for (const warning of result.warnings ?? []) {
    writer.write(`warning: ${warning}\n`);
  }
}

export function writeErrorResult(error: unknown, writer: Writer, format: OutputFormat, command?: string): number {
  const exitCode = error instanceof ApoloError ? error.exitCode : 1;
  const failure: CliResult = {
    ok: false,
    ...(command ? { command } : {}),
    exitCode,
    error: toStructuredError(error)
  };

  if (format === "json") {
    writer.write(`${JSON.stringify(failure)}\n`);
    return exitCode;
  }

  writer.write(`[apolo] error: ${failure.error.message}\n`);
  if (failure.error.hint) {
    writer.write(`${failure.error.hint}\n`);
  }

  return exitCode;
}
