import { spawn } from "node:child_process";
import type { Env } from "../fs/layout.js";

export interface ProcessRunOptions {
  readonly cwd: string;
  readonly env: Env;
  readonly timeoutMs?: number;
  readonly signal: AbortSignal | undefined;
}

export interface ProcessResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export async function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessRunOptions
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 5_000);

    const abort = (): void => {
      timedOut = true;
      child.kill();
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve({
        command,
        args,
        exitCode,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

export async function resolveExecutablePath(
  command: string,
  options: ProcessRunOptions
): Promise<string | undefined> {
  const locator = process.platform === "win32"
    ? { command: "where", args: [command] }
    : { command: "sh", args: ["-c", `command -v ${quoteShellWord(command)}`] };

  try {
    const result = await runProcess(locator.command, locator.args, {
      ...options,
      timeoutMs: options.timeoutMs ?? 2_000
    });
    const [firstLine] = result.stdout.trim().split(/\r?\n/u);
    return result.exitCode === 0 && firstLine ? firstLine : undefined;
  } catch {
    return undefined;
  }
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
