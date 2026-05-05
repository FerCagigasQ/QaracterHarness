export const MANIFEST_FILE_NAME = "manifest.json";
export const CONFIG_FILE_NAME = "apolo.config.json";
export const MANIFEST_SCHEMA_VERSION = 1;

export type CoordinatorProvider = "claude";
export type ApprovalPolicy = "always";
export type MemoryDriver = "jsonl";
export type InitMode = "pull-request";
export type RuntimeBackend = "typescript";

export interface AgentManifestEntry {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
}

export interface ApoloManifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  readonly project: {
    readonly name: string;
    readonly root: string;
  };
  readonly runtime: {
    readonly backends: readonly RuntimeBackend[];
  };
  readonly coordinator: {
    readonly provider: CoordinatorProvider;
    readonly approval: ApprovalPolicy;
  };
  readonly models: {
    readonly ollama: {
      readonly defaultModel: "qwen";
    };
  };
  readonly agents: {
    readonly maxPerTask: 5;
    readonly configured: readonly AgentManifestEntry[];
  };
  readonly git: {
    readonly initMode: InitMode;
    readonly directMain: false;
  };
  readonly memory: {
    readonly driver: MemoryDriver;
    readonly globalPath: string;
    readonly repoPath: string;
  };
}

export interface ApoloConfig {
  readonly manifest: ApoloManifest;
  readonly configPath?: string;
}
