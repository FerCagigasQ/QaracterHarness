import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../config/loader.js";
import type { Env } from "../fs/layout.js";
import type { ApprovedMemory, ContextPack, DetectedAgent, VerificationCommand } from "./types.js";

const DOCUMENT_CANDIDATES = [
  "README.md",
  "docs/USAGE.md",
  "docs/usage.md",
  "docs/SYSTEM.md",
  "docs/architecture.md",
  "docs/command-reference.md",
  "docs/adapters.md",
  "docs/memory.md",
  "docs/security.md",
  "docs/run.md",
  "AGENTS.md"
] as const;

const AGENT_EXECUTABLES = [
  { name: "claude-code", executable: "claude", description: "Claude Code coordinator" },
  { name: "codex-cli", executable: "codex", description: "Codex CLI implementation/review agent" },
  { name: "github-copilot-cli", executable: "gh", description: "GitHub Copilot CLI suggestion agent" },
  { name: "opencode", executable: "opencode", description: "OpenCode local agent" },
  { name: "gemini-cli", executable: "gemini", description: "Gemini CLI local agent" },
  { name: "cursor-cli", executable: "cursor-agent", description: "Cursor CLI local agent" },
  { name: "ollama-qwen", executable: "ollama", description: "Ollama Qwen local model" }
] as const;

export async function buildContextPack(cwd: string, env: Env): Promise<ContextPack> {
  const config = await loadConfig(cwd, env);
  const packageJson = await readJsonObject(join(cwd, "package.json"));
  const documents = await readDocuments(cwd);
  const verificationCommands = await detectVerificationCommands(cwd, packageJson);
  const agents = await detectAgents(config.manifest.agents.configured, env);
  const approvedMemory = await readApprovedMemory(cwd);

  return {
    projectName: config.manifest.project.name,
    root: config.manifest.project.root,
    metadata: [
      `repository: ${basename(cwd)}`,
      `coordinator: ${config.manifest.coordinator.provider}`,
      `approval policy: ${config.manifest.coordinator.approval}`,
      `runtime backends: ${config.manifest.runtime.backends.join(", ")}`,
      `configured max agents: ${config.manifest.agents.maxPerTask}`,
      `package: ${readString(packageJson, "name") ?? "unknown"}@${readString(packageJson, "version") ?? "unknown"}`
    ],
    documents,
    verificationCommands,
    agents,
    approvedMemory
  };
}

async function readDocuments(cwd: string): Promise<ContextPack["documents"]> {
  const documents: ContextPack["documents"][number][] = [];

  for (const relativePath of DOCUMENT_CANDIDATES) {
    const path = join(cwd, relativePath);
    if (!(await fileExists(path))) {
      continue;
    }

    const content = await readFile(path, "utf8");
    documents.push({
      path: relativePath,
      excerpt: compactExcerpt(content, 1400)
    });
  }

  return documents;
}

async function detectVerificationCommands(
  cwd: string,
  packageJson: Record<string, unknown> | undefined
): Promise<readonly VerificationCommand[]> {
  const commands: VerificationCommand[] = [];
  const scripts = readRecord(packageJson, "scripts");

  for (const script of ["lint", "typecheck", "build", "test"] as const) {
    if (typeof scripts?.[script] === "string") {
      commands.push({ name: `npm-${script}`, command: ["npm", "run", script] });
    }
  }

  if (await fileExists(join(cwd, "Makefile"))) {
    const makefile = await readFile(join(cwd, "Makefile"), "utf8");
    for (const target of ["lint", "typecheck", "build", "test"] as const) {
      if (new RegExp(`^${target}:`, "m").test(makefile)) {
        commands.push({ name: `make-${target}`, command: ["make", target] });
      }
    }
  }

  return commands;
}

async function detectAgents(
  configuredAgents: readonly { name: string; description: string; enabled: boolean }[],
  env: Env
): Promise<readonly DetectedAgent[]> {
  const configured = configuredAgents
    .filter((agent) => agent.enabled)
    .map((agent) => ({
      name: agent.name,
      description: agent.description,
      source: "configured" as const,
      available: true
    }));
  const detected = await Promise.all(
    AGENT_EXECUTABLES.map(async (agent) => ({
      name: agent.name,
      description: agent.description,
      source: "detected" as const,
      available: await executableExists(agent.executable, env)
    }))
  );
  const available = detected.filter((agent) => agent.available);

  if (configured.length > 0 || available.length > 0) {
    return [...configured, ...available].slice(0, 5);
  }

  return [
    {
      name: "claude-coordinator",
      description: "Default planner slot; deterministic fallback is used if Claude CLI is unavailable.",
      source: "default",
      available: false
    }
  ];
}

async function readApprovedMemory(cwd: string): Promise<readonly ApprovedMemory[]> {
  const markdownMemory = await readMarkdownMemory(join(cwd, "apolo-memory"));
  const repoMemory = await readSqliteMemorySummary(join(cwd, ".apolo", "memory", "repo.sqlite"));
  return [...repoMemory, ...markdownMemory].slice(0, 8);
}

async function readMarkdownMemory(dir: string): Promise<readonly ApprovedMemory[]> {
  if (!(await fileExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const memories: ApprovedMemory[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const content = await readFile(join(dir, entry.name), "utf8");
    memories.push({
      title: entry.name.replace(/\.md$/u, ""),
      body: compactExcerpt(content, 900),
      source: "markdown"
    });
  }

  return memories;
}

async function readSqliteMemorySummary(path: string): Promise<readonly ApprovedMemory[]> {
  if (!(await fileExists(path))) {
    return [];
  }

  return [
    {
      title: "Repository SQLite memory available",
      body: `Approved repository memory database detected at ${path}. TypeScript planning does not require Python and treats this as available context without mutating it.`,
      source: "repo"
    }
  ];
}

async function executableExists(executable: string, env: Env): Promise<boolean> {
  const pathValue = env.PATH ?? process.env.PATH ?? "";
  const paths = pathValue.split(process.platform === "win32" ? ";" : ":").filter(Boolean);
  const candidates = process.platform === "win32" ? [executable, `${executable}.cmd`, `${executable}.exe`] : [executable];

  for (const directory of paths) {
    for (const candidate of candidates) {
      try {
        await access(join(directory, candidate), constants.X_OK);
        return true;
      } catch {
        // Continue searching PATH.
      }
    }
  }

  return false;
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return isRecord(parsed) ? parsed : undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function compactExcerpt(content: string, maxLength: number): string {
  const compacted = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function readRecord(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
}

function readString(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
