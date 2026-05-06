import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunPlan, VerificationResult, VerificationSpec } from "./types.js";

const defaultPackageScripts = ["lint", "typecheck", "test", "build"] as const;

export async function runVerification(cwd: string, plan: RunPlan): Promise<readonly VerificationResult[]> {
  const specs = plan.verifications.length > 0 ? plan.verifications : await detectPackageVerifications(cwd);
  const results: VerificationResult[] = [];
  for (const spec of specs) {
    results.push(await runVerificationCommand(spec, cwd));
  }
  return results;
}

async function detectPackageVerifications(cwd: string): Promise<readonly VerificationSpec[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) {
      return [];
    }
    const scripts = parsed.scripts;
    return defaultPackageScripts.flatMap((script): VerificationSpec[] =>
      typeof scripts[script] === "string"
        ? [
            {
              name: `npm-${script}`,
              command: ["npm", "run", script]
            }
          ]
        : []
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function runVerificationCommand(spec: VerificationSpec, cwd: string): Promise<VerificationResult> {
  const [command, ...args] = spec.command;
  if (!command) {
    return {
      name: spec.name,
      command: spec.command,
      exitCode: 127,
      stdout: "",
      stderr: "Empty verification command.",
      passed: false
    };
  }

  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolvePromise({
        name: spec.name,
        command: spec.command,
        exitCode: 127,
        stdout: limitOutput(stdout),
        stderr: limitOutput(`${stderr}${error.message}`),
        passed: false
      });
    });
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      resolvePromise({
        name: spec.name,
        command: spec.command,
        exitCode,
        stdout: limitOutput(stdout),
        stderr: limitOutput(stderr),
        passed: exitCode === 0
      });
    });
  });
}

function limitOutput(value: string): string {
  return value.length > 4000 ? `${value.slice(0, 4000)}\n[truncated]` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
