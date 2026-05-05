import { basename, resolve } from "node:path";
import { resolveApoloPaths, type Env } from "../fs/layout.js";
import { MANIFEST_SCHEMA_VERSION, type ApoloManifest } from "./manifest.js";

export function createDefaultManifest(cwd: string, env: Env): ApoloManifest {
  const paths = resolveApoloPaths(cwd, env);
  const root = resolve(cwd);

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    project: {
      name: basename(root),
      root
    },
    runtime: {
      backends: ["typescript"]
    },
    coordinator: {
      provider: "claude",
      approval: "always"
    },
    models: {
      ollama: {
        defaultModel: "qwen"
      }
    },
    agents: {
      maxPerTask: 5,
      configured: []
    },
    git: {
      initMode: "pull-request",
      directMain: false
    },
    memory: {
      driver: "sqlite",
      globalPath: paths.globalMemoryDb,
      repoPath: paths.repoMemoryDb
    }
  };
}
