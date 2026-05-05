import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr } from "node:process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApoloError } from "./errors.js";
import { createLogger, logLevelFromArgs, type Writer } from "./logger.js";
import { dispatch } from "./router.js";
import type { Env } from "../fs/layout.js";

export interface CliRuntime {
  readonly cwd: string;
  readonly env: Env;
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly isInteractive: boolean;
  readonly readLine: (prompt: string) => Promise<string>;
}

export async function main(args: readonly string[], runtime: Partial<CliRuntime> = {}): Promise<number> {
  const resolvedRuntime = resolveRuntime(runtime);
  const commandArgs = stripGlobalFlags(args);
  const logger = createLogger(resolvedRuntime.stderr, logLevelFromArgs(args));

  try {
    if (commandArgs[0] === "--version" || commandArgs[0] === "-v") {
      resolvedRuntime.stdout.write(`${readPackageVersion()}\n`);
      return 0;
    }

    return await dispatch(commandArgs, {
      cwd: resolvedRuntime.cwd,
      env: resolvedRuntime.env,
      isInteractive: resolvedRuntime.isInteractive,
      logger,
      stdout: resolvedRuntime.stdout,
      stderr: resolvedRuntime.stderr,
      readLine: resolvedRuntime.readLine
    });
  } catch (error) {
    if (error instanceof ApoloError) {
      logger.error(error.message);
      if (error.hint) {
        resolvedRuntime.stderr.write(`${error.hint}\n`);
      }

      return error.exitCode;
    }

    logger.error(error instanceof Error ? error.message : "Unexpected failure.");
    return 1;
  }
}

function resolveRuntime(runtime: Partial<CliRuntime>): CliRuntime {
  return {
    cwd: runtime.cwd ?? process.cwd(),
    env: runtime.env ?? process.env,
    stdout: runtime.stdout ?? stdout,
    stderr: runtime.stderr ?? stderr,
    isInteractive: runtime.isInteractive ?? stdin.isTTY,
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

function stripGlobalFlags(args: readonly string[]): readonly string[] {
  return args.filter((arg) => arg !== "--verbose" && arg !== "--quiet");
}

function readPackageVersion(): string {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}
