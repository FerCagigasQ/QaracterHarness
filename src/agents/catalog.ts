export const MAX_AGENTS_PER_TASK = 5;

export type AgentId =
  | "claude-code"
  | "codex-cli"
  | "github-copilot-cli"
  | "opencode"
  | "gemini-cli"
  | "cursor-cli"
  | "ollama-qwen";

export type TaskCapability = "simple" | "bug" | "feature" | "security" | "performance";

export interface AgentCapabilities {
  readonly tasks: readonly TaskCapability[];
  readonly canCoordinate: boolean;
  readonly prCapable: boolean;
  readonly localExecution: boolean;
  readonly machineReadableOutput: boolean;
  readonly notes: readonly string[];
}

export interface AgentProvider {
  readonly id: AgentId;
  readonly displayName: string;
  readonly executableCandidates: readonly string[];
  readonly versionArgs: readonly string[];
  readonly probeArgs: readonly string[] | null;
  readonly commandPattern: readonly string[];
  readonly jsonCommandPattern: readonly string[] | null;
  readonly capabilities: AgentCapabilities;
}

const allTasks: readonly TaskCapability[] = ["simple", "bug", "feature", "security", "performance"];
const codeTasks: readonly TaskCapability[] = ["simple", "bug", "feature", "performance"];

export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  {
    id: "claude-code",
    displayName: "Claude Code",
    executableCandidates: ["claude"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "--print", "{prompt}"],
    jsonCommandPattern: ["{executable}", "--print", "--output-format", "json", "{prompt}"],
    capabilities: {
      tasks: allTasks,
      canCoordinate: true,
      prCapable: true,
      localExecution: true,
      machineReadableOutput: true,
      notes: ["default coordinator"]
    }
  },
  {
    id: "codex-cli",
    displayName: "Codex CLI",
    executableCandidates: ["codex"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "exec", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: allTasks,
      canCoordinate: false,
      prCapable: true,
      localExecution: true,
      machineReadableOutput: false,
      notes: []
    }
  },
  {
    id: "github-copilot-cli",
    displayName: "GitHub Copilot CLI",
    executableCandidates: ["gh"],
    versionArgs: ["copilot", "--version"],
    probeArgs: ["copilot", "--help"],
    commandPattern: ["{executable}", "copilot", "suggest", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: codeTasks,
      canCoordinate: false,
      prCapable: false,
      localExecution: true,
      machineReadableOutput: false,
      notes: ["requires the gh copilot extension"]
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    executableCandidates: ["opencode"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "run", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: allTasks,
      canCoordinate: false,
      prCapable: false,
      localExecution: true,
      machineReadableOutput: false,
      notes: []
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    executableCandidates: ["gemini"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "--prompt", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: ["simple", "feature", "security", "performance"],
      canCoordinate: false,
      prCapable: false,
      localExecution: true,
      machineReadableOutput: false,
      notes: []
    }
  },
  {
    id: "cursor-cli",
    displayName: "Cursor CLI",
    executableCandidates: ["cursor-agent", "cursor"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "--prompt", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: codeTasks,
      canCoordinate: false,
      prCapable: false,
      localExecution: true,
      machineReadableOutput: false,
      notes: []
    }
  },
  {
    id: "ollama-qwen",
    displayName: "Ollama/Qwen",
    executableCandidates: ["ollama"],
    versionArgs: ["--version"],
    probeArgs: null,
    commandPattern: ["{executable}", "run", "qwen2.5-coder:latest", "{prompt}"],
    jsonCommandPattern: null,
    capabilities: {
      tasks: ["simple", "bug", "performance"],
      canCoordinate: false,
      prCapable: false,
      localExecution: true,
      machineReadableOutput: false,
      notes: ["uses qwen2.5-coder:latest by default"]
    }
  }
] as const;

export function isTaskCapability(value: string): value is TaskCapability {
  return ["simple", "bug", "feature", "security", "performance"].includes(value);
}

export function findAgentProvider(id: string): AgentProvider | undefined {
  return AGENT_PROVIDERS.find((provider) => provider.id === id);
}

export function renderCommandPattern(
  pattern: readonly string[],
  executable: string,
  prompt: string
): readonly string[] {
  return pattern.map((part) => {
    if (part === "{executable}") {
      return executable;
    }
    if (part === "{prompt}") {
      return prompt;
    }
    return part;
  });
}
