import { ApoloError } from "../core/errors.js";
import type { OutputFormat } from "../core/results.js";

export interface ParsedGlobalOptions {
  readonly commandArgs: readonly string[];
  readonly outputFormat: OutputFormat;
}

export function parseGlobalOptions(args: readonly string[]): ParsedGlobalOptions {
  const commandArgs: string[] = [];
  let outputFormat: OutputFormat = "text";
  let commandName: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--verbose" || arg === "--quiet") {
      continue;
    }

    if (arg === "--json") {
      outputFormat = "json";
      continue;
    }

    if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (isCommandSpecificFormat(commandName)) {
        commandArgs.push(arg);
        continue;
      }
      outputFormat = parseGlobalFormat(value);
      continue;
    }

    if (arg === "--format") {
      const value = args[index + 1];
      if (isCommandSpecificFormat(commandName)) {
        commandArgs.push(arg);
        if (value !== undefined) {
          commandArgs.push(value);
          index += 1;
        }
        continue;
      }

      outputFormat = parseGlobalFormat(value);
      index += 1;
      continue;
    }

    commandName ??= arg.startsWith("-") ? undefined : arg;
    commandArgs.push(arg);
  }

  return { commandArgs, outputFormat };
}

function parseGlobalFormat(value: string | undefined): OutputFormat {
  if (value === "text" || value === "json") {
    return value;
  }
  throw new ApoloError("--format must be either text or json.", {
    code: "INVALID_ARGUMENTS",
    exitCode: 2,
    hint: "Use `--format json` for machine-readable output."
  });
}

function isCommandSpecificFormat(commandName: string | undefined): boolean {
  return commandName === "init" || commandName === "plan" || commandName === "memory" || commandName === "agents";
}

export function detectOutputFormat(args: readonly string[]): OutputFormat {
  if (args.includes("--json")) {
    return "json";
  }

  const formatIndex = args.indexOf("--format");
  return formatIndex >= 0 && args[formatIndex + 1] === "json" ? "json" : "text";
}
