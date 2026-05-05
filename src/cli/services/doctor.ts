import { loadConfig } from "../../config/loader.js";
import { fileExists, resolveApoloPaths } from "../../fs/layout.js";
import { commandOk, resolveExecutablePath, runProcess } from "../../core/index.js";
import type { CommandResult, CommandService, CommandServiceContext, ProcessResult } from "../../core/index.js";

export type DoctorCheckStatus = "ok" | "missing" | "optional" | "warning";

export interface DoctorCheck {
  readonly name: string;
  readonly status: DoctorCheckStatus;
  readonly detail: string;
}

export interface DoctorCommandOutput {
  readonly cwd: string;
  readonly manifest: string | null;
  readonly config: string | null;
  readonly checks: readonly DoctorCheck[];
  readonly paths: {
    readonly globalHome: string;
    readonly repoHome: string;
    readonly globalMemory: string;
    readonly repoMemory: string;
  };
}

export interface DoctorCommandInput {
  readonly args: readonly string[];
}

export class DoctorCommandService implements CommandService<DoctorCommandInput, DoctorCommandOutput> {
  async execute(input: DoctorCommandInput, context: CommandServiceContext): Promise<CommandResult<DoctorCommandOutput>> {
    const config = await loadConfig(context.cwd, context.env);
    const paths = resolveApoloPaths(context.cwd, context.env);
    const manifestExists = await fileExists(paths.manifestPath);

    const [node, npm, git, python, python3] = await Promise.all([
      inspectTool("node", ["--version"], context),
      inspectTool("npm", ["--version"], context),
      inspectTool("git", ["--version"], context),
      inspectTool("python", ["--version"], context),
      inspectTool("python3", ["--version"], context)
    ]);
    const optionalPython = python.path ? python : python3;

    const checks: DoctorCheck[] = [
      nodeCheck(node),
      requiredToolCheck("npm", npm),
      requiredToolCheck("git", git),
      {
        name: "apolo paths",
        status: "ok",
        detail: `${paths.repoHome}; ${paths.globalHome}`
      },
      {
        name: "manifest",
        status: manifestExists ? "ok" : "warning",
        detail: manifestExists ? paths.manifestPath : "not initialized"
      },
      {
        name: "python",
        status: "optional",
        detail: optionalPython.path
          ? `optional runtime detected at ${optionalPython.path} (${firstOutputLine(optionalPython.version)})`
          : "optional runtime not detected; APOLO TypeScript core does not require Python"
      }
    ];

    const output: DoctorCommandOutput = {
      cwd: context.cwd,
      manifest: manifestExists ? paths.manifestPath : null,
      config: config.configPath ?? null,
      checks,
      paths: {
        globalHome: paths.globalHome,
        repoHome: paths.repoHome,
        globalMemory: config.manifest.memory.globalPath,
        repoMemory: config.manifest.memory.repoPath
      }
    };

    return commandOk("doctor", {
      message: "APOLO doctor",
      lines: [
        `cwd: ${output.cwd}`,
        `manifest: ${output.manifest ?? "not initialized"}`,
        `config: ${output.config ?? "defaults"}`,
        `node: ${formatCheck(nodeCheck(node))}`,
        `npm: ${formatCheck(requiredToolCheck("npm", npm))}`,
        `git: ${formatCheck(requiredToolCheck("git", git))}`,
        `python: ${formatCheck(checks[5])}`,
        `apolo repo home: ${paths.repoHome}`,
        `apolo global home: ${paths.globalHome}`,
        `coordinator: ${config.manifest.coordinator.provider}`,
        `approval: ${config.manifest.coordinator.approval}`,
        `ollama default model: ${config.manifest.models.ollama.defaultModel}`,
        `max agents per task: ${config.manifest.agents.maxPerTask}`,
        `global memory: ${config.manifest.memory.globalPath}`,
        `repo memory: ${config.manifest.memory.repoPath}`
      ],
      data: output
    });
  }
}

interface ToolInspection {
  readonly path: string | undefined;
  readonly version: ProcessResult | undefined;
}

async function inspectTool(
  command: string,
  args: readonly string[],
  context: CommandServiceContext
): Promise<ToolInspection> {
  const path = await resolveExecutablePath(command, {
    cwd: context.cwd,
    env: context.env,
    signal: context.signal,
    timeoutMs: 2_000
  });

  if (!path) {
    return { path: undefined, version: undefined };
  }

  const version = await runProcess(command, args, {
    cwd: context.cwd,
    env: context.env,
    signal: context.signal,
    timeoutMs: 2_000
  });

  return { path, version };
}

function nodeCheck(tool: ToolInspection): DoctorCheck {
  if (!tool.path) {
    return { name: "node", status: "missing", detail: "Node.js 20+ is required" };
  }

  const version = firstOutputLine(tool.version);
  const match = /^v(?<major>\d+)/u.exec(version);
  const major = match?.groups?.major ? Number.parseInt(match.groups.major, 10) : 0;

  return {
    name: "node",
    status: major >= 20 ? "ok" : "warning",
    detail: major >= 20 ? `${tool.path} (${version})` : `${tool.path} (${version}); Node.js 20+ is required`
  };
}

function requiredToolCheck(name: string, tool: ToolInspection): DoctorCheck {
  return {
    name,
    status: tool.path ? "ok" : "missing",
    detail: tool.path ? `${tool.path} (${firstOutputLine(tool.version)})` : `${name} is required`
  };
}

function formatCheck(check: DoctorCheck | undefined): string {
  if (!check) {
    return "missing - check unavailable";
  }

  return `${check.status} - ${check.detail}`;
}

function firstOutputLine(result: ProcessResult | undefined): string {
  const output = `${result?.stdout ?? ""}${result?.stderr ?? ""}`.trim();
  return output.split(/\r?\n/u)[0] ?? "unknown";
}
