import { access, constants } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";
import { AGENT_PROVIDERS, type AgentCapabilities, type AgentId, type AgentProvider } from "./catalog.js";
import type { Env } from "../fs/layout.js";

export interface AgentDetection {
  readonly id: AgentId;
  readonly displayName: string;
  readonly installed: boolean;
  readonly executable: string | null;
  readonly version: string | null;
  readonly capabilities: AgentCapabilities;
  readonly prCapable: boolean;
  readonly checkedCandidates: readonly string[];
  readonly missingReason: string | null;
}

export interface DetectAgentsOptions {
  readonly env?: Env;
  readonly providers?: readonly AgentProvider[];
  readonly timeoutMs?: number;
}

export async function detectAgents(options: DetectAgentsOptions = {}): Promise<readonly AgentDetection[]> {
  const env = options.env ?? process.env;
  const providers = options.providers ?? AGENT_PROVIDERS;
  const timeoutMs = options.timeoutMs ?? 1_500;
  const detections: AgentDetection[] = [];

  for (const provider of providers) {
    const executable = await resolveExecutable(provider.executableCandidates, env);
    const probeSucceeded =
      executable !== null && provider.probeArgs !== null
        ? await commandSucceeds(executable, provider.probeArgs, env, timeoutMs)
        : executable !== null;
    const installed = executable !== null && probeSucceeded;
    const version = installed ? await safeVersion(executable, provider.versionArgs, env, timeoutMs) : null;

    detections.push({
      id: provider.id,
      displayName: provider.displayName,
      installed,
      executable: installed ? executable : null,
      version,
      capabilities: provider.capabilities,
      prCapable: provider.capabilities.prCapable,
      checkedCandidates: provider.executableCandidates,
      missingReason: installed ? null : missingReason(provider, executable)
    });
  }

  return detections;
}

async function resolveExecutable(candidates: readonly string[], env: Env): Promise<string | null> {
  for (const candidate of candidates) {
    const resolved = await which(candidate, env);
    if (resolved !== null) {
      return resolved;
    }
  }
  return null;
}

function getPathExtensions(env: Env): readonly string[] {
  const pathExt = env.PATHEXT ?? "";
  if (!pathExt) {
    return [""];
  }
  return ["", ...pathExt.split(";").map((ext) => ext.toLowerCase())];
}

async function which(executable: string, env: Env): Promise<string | null> {
  const extensions = getPathExtensions(env);

  if (isAbsolute(executable)) {
    for (const ext of extensions) {
      const fullPath = ext ? `${executable}${ext}` : executable;
      if (await isExecutable(fullPath)) {
        return fullPath;
      }
    }
    return null;
  }

  const pathValue = env.PATH ?? "";
  for (const entry of pathValue.split(delimiter)) {
    if (!entry) {
      continue;
    }
    for (const ext of extensions) {
      const candidate = ext ? join(entry, `${executable}${ext}`) : join(entry, executable);
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function safeVersion(
  executable: string,
  versionArgs: readonly string[],
  env: Env,
  timeoutMs: number
): Promise<string | null> {
  const result = await runCommand(executable, versionArgs, env, timeoutMs);
  if (result === null || result.exitCode !== 0) {
    return null;
  }

  const output = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return output ?? null;
}

async function commandSucceeds(
  executable: string,
  args: readonly string[],
  env: Env,
  timeoutMs: number
): Promise<boolean> {
  const result = await runCommand(executable, args, env, timeoutMs);
  return result !== null && result.exitCode === 0;
}

interface CommandResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCommand(
  executable: string,
  args: readonly string[],
  env: Env,
  timeoutMs: number
): Promise<CommandResult | null> {
  return new Promise((resolve) => {
    const useShell = executable.endsWith(".cmd") || executable.endsWith(".bat");
    const child = spawn(executable, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    function settle(result: CommandResult | null): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(null);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", () => {
      settle(null);
    });
    child.on("close", (exitCode) => {
      settle({ exitCode, stdout, stderr });
    });
  });
}

function missingReason(provider: AgentProvider, executable: string | null): string {
  if (executable !== null && provider.probeArgs !== null) {
    return `found ${provider.executableCandidates.join("/")} but required CLI subcommand probe failed`;
  }

  return `none of ${provider.executableCandidates.join(", ")} found on PATH`;
}
