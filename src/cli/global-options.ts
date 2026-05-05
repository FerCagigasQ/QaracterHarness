import { ApoloError } from "../core/errors.js";
import type { OutputFormat } from "../core/results.js";

export interface ParsedGlobalOptions {
  readonly commandArgs: readonly string[];
  readonly outputFormat: OutputFormat;
}

export function parseGlobalOptions(args: readonly string[]): ParsedGlobalOptions {
  const commandArgs: string[] = [];
  let outputFormat: OutputFormat = "text";

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

    if (arg === "--format") {
      const value = args[index + 1];
      if (value !== "text" && value !== "json") {
        throw new ApoloError("--format must be either text or json.", {
          code: "INVALID_ARGUMENTS",
          exitCode: 2,
          hint: "Use `--format json` for machine-readable output."
        });
      }

      outputFormat = value;
      index += 1;
      continue;
    }

    commandArgs.push(arg);
  }

  return { commandArgs, outputFormat };
}

export function detectOutputFormat(args: readonly string[]): OutputFormat {
  if (args.includes("--json")) {
    return "json";
  }

  const formatIndex = args.indexOf("--format");
  return formatIndex >= 0 && args[formatIndex + 1] === "json" ? "json" : "text";
}
