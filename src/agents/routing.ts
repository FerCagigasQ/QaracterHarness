import {
  AGENT_PROVIDERS,
  MAX_AGENTS_PER_TASK,
  findAgentProvider,
  isTaskCapability,
  renderCommandPattern,
  type AgentId,
  type TaskCapability
} from "./catalog.js";
import type { AgentDetection } from "./detection.js";

export interface RoutingRequest {
  readonly prompt: string;
  readonly task?: TaskCapability | undefined;
  readonly requestedAgentIds?: readonly AgentId[];
  readonly requirePr?: boolean;
  readonly maxAgents?: number;
  readonly preferJson?: boolean;
}

export interface RoutedAgent {
  readonly id: AgentId;
  readonly displayName: string;
  readonly executable: string;
  readonly version: string | null;
  readonly prCapable: boolean;
  readonly capabilities: readonly TaskCapability[];
  readonly command: readonly string[];
  readonly machineReadableCommand: readonly string[] | null;
}

export interface RoutingDecision {
  readonly task: TaskCapability;
  readonly coordinator: AgentId | null;
  readonly maxAgents: typeof MAX_AGENTS_PER_TASK;
  readonly selectedAgents: readonly RoutedAgent[];
  readonly skippedMissingAgentIds: readonly AgentId[];
  readonly reasons: readonly string[];
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export function classifyTask(prompt: string): TaskCapability {
  const normalized = prompt.toLowerCase();
  const keywordMap: readonly [TaskCapability, readonly string[]][] = [
    ["security", ["security", "vulnerability", "cve", "secret", "auth", "owasp", "sast"]],
    ["performance", ["performance", "latency", "slow", "optimize", "throughput", "profil"]],
    ["bug", ["bug", "fix", "broken", "error", "exception", "fail", "regression"]],
    ["feature", ["feature", "implement", "add", "build", "create", "support"]]
  ];

  for (const [task, keywords] of keywordMap) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return task;
    }
  }

  return "simple";
}

export function routeAgents(request: RoutingRequest, detections: readonly AgentDetection[]): RoutingDecision {
  const task = request.task ?? classifyTask(request.prompt);
  const maxAgents = request.maxAgents ?? MAX_AGENTS_PER_TASK;
  if (maxAgents < 1 || maxAgents > MAX_AGENTS_PER_TASK) {
    throw new RoutingError(`maxAgents must be between 1 and ${MAX_AGENTS_PER_TASK}`);
  }

  const installedById = new Map(detections.filter((agent) => agent.installed).map((agent) => [agent.id, agent]));
  if (installedById.size === 0) {
    throw new RoutingError("No supported local agent CLIs are installed");
  }

  const requestedIds = request.requestedAgentIds ?? [];
  const candidateIds =
    requestedIds.length > 0
      ? requestedIds
      : priorityForTask(task).filter((id) => {
          const detection = installedById.get(id);
          return detection !== undefined && detection.capabilities.tasks.includes(task);
        });

  const selectedIds = candidateIds.filter((id) => {
    const detection = installedById.get(id);
    if (detection === undefined || !detection.capabilities.tasks.includes(task)) {
      return false;
    }
    return request.requirePr === true ? detection.prCapable : true;
  });

  const selected = selectedIds.slice(0, maxAgents).map((id) => {
    const detection = installedById.get(id);
    const provider = findAgentProvider(id);
    if (detection === undefined || provider === undefined || detection.executable === null) {
      throw new RoutingError(`Agent ${id} was selected but is not installed`);
    }

    return {
      id,
      displayName: detection.displayName,
      executable: detection.executable,
      version: detection.version,
      prCapable: detection.prCapable,
      capabilities: detection.capabilities.tasks,
      command: renderCommandPattern(provider.commandPattern, detection.executable, request.prompt),
      machineReadableCommand:
        request.preferJson === true && provider.jsonCommandPattern !== null
          ? renderCommandPattern(provider.jsonCommandPattern, detection.executable, request.prompt)
          : null
    };
  });

  if (selected.length === 0) {
    const suffix = request.requirePr === true ? " with PR capability" : "";
    throw new RoutingError(`No installed agents support ${task} tasks${suffix}`);
  }

  return {
    task,
    coordinator: selected.find((agent) => agent.id === "claude-code")?.id ?? selected[0]?.id ?? null,
    maxAgents: MAX_AGENTS_PER_TASK,
    selectedAgents: selected,
    skippedMissingAgentIds: AGENT_PROVIDERS.filter((provider) => !installedById.has(provider.id)).map(
      (provider) => provider.id
    ),
    reasons: [
      requestedIds.length > 0 ? "using requested installed agents only" : `selected installed agents for ${task}`,
      request.requirePr === true ? "filtered to PR-capable providers" : "excluded missing agents",
      `limited to ${selected.length}/${MAX_AGENTS_PER_TASK} agents`
    ]
  };
}

export function parseTaskCapability(value: string | undefined): TaskCapability | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isTaskCapability(value)) {
    throw new RoutingError(`Unsupported task capability: ${value}`);
  }
  return value;
}

function priorityForTask(task: TaskCapability): readonly AgentId[] {
  const priorities: Record<TaskCapability, readonly AgentId[]> = {
    simple: ["claude-code", "ollama-qwen", "codex-cli", "github-copilot-cli", "cursor-cli"],
    bug: ["claude-code", "codex-cli", "cursor-cli", "ollama-qwen", "github-copilot-cli"],
    feature: ["claude-code", "codex-cli", "cursor-cli", "gemini-cli", "opencode"],
    security: ["claude-code", "codex-cli", "gemini-cli", "opencode"],
    performance: ["claude-code", "codex-cli", "gemini-cli", "opencode", "cursor-cli"]
  };
  return priorities[task];
}
