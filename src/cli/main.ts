import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, logLevelFromArgs, type Writer } from "./logger.js";
import { dispatch } from "./router.js";
import { detectOutputFormat, parseGlobalOptions } from "./global-options.js";
import { writeCommandResult, writeErrorResult } from "./output.js";
import type { Env } from "../fs/layout.js";

export interface CliRuntime {
  readonly cwd: string;
  readonly env: Env;
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly isInteractive: boolean;
  readonly signal: AbortSignal | undefined;
  readonly readLine: (prompt: string) => Promise<string>;
}

export async function main(args: readonly string[], runtime: Partial<CliRuntime> = {}): Promise<number> {
  const resolvedRuntime = resolveRuntime(runtime);
  const fallbackOutputFormat = detectOutputFormat(args);

  try {
    const { commandArgs, outputFormat } = parseGlobalOptions(args);
    const logger = createLogger(resolvedRuntime.stderr, outputFormat === "json" ? "silent" : logLevelFromArgs(args));

    if (commandArgs[0] === "--version" || commandArgs[0] === "-v") {
      if (outputFormat === "json") {
        resolvedRuntime.stdout.write(`${JSON.stringify({ ok: true, command: "version", exitCode: 0, data: { version: readPackageVersion() } })}\n`);
      } else {
        resolvedRuntime.stdout.write(`${readPackageVersion()}\n`);
      }
      return 0;
    }

    const result = await dispatch(commandArgs, {
      cwd: resolvedRuntime.cwd,
      env: resolvedRuntime.env,
      isInteractive: resolvedRuntime.isInteractive,
      outputFormat,
      signal: resolvedRuntime.signal,
      logger,
      stdout: resolvedRuntime.stdout,
      stderr: resolvedRuntime.stderr,
      readLine: resolvedRuntime.readLine
    });
    writeCommandResult(result, resolvedRuntime.stdout, outputFormat);
    return result.exitCode;
  } catch (error) {
    return writeErrorResult(error, resolvedRuntime.stderr, fallbackOutputFormat);
  }
}

function resolveRuntime(runtime: Partial<CliRuntime>): CliRuntime {
  return {
    cwd: runtime.cwd ?? process.cwd(),
    env: runtime.env ?? process.env,
    stdout: runtime.stdout ?? stdout,
    stderr: runtime.stderr ?? stderr,
    isInteractive: runtime.isInteractive ?? stdin.isTTY,
    signal: runtime.signal,
    readLine: runtime.readLine ?? defaultReadLine
  };
}

async function defaultReadLine(prompt: string): Promise<string> {
  const reader = createInterface({ input: stdin, output: stdout });

  try {
    return await reader.question(prompt);
  } finally {
    reader.close();
  }
}

function readPackageVersion(): string {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}
