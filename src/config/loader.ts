import { readFile } from "node:fs/promises";
import { fileExists, resolveApoloPaths, type Env } from "../fs/layout.js";
import { ApoloError } from "../core/errors.js";
import { createDefaultManifest } from "./defaults.js";
import type { ApoloConfig, ApoloManifest } from "./manifest.js";

export async function loadConfig(cwd: string, env: Env): Promise<ApoloConfig> {
  const paths = resolveApoloPaths(cwd, env);
  const defaultManifest = createDefaultManifest(cwd, env);

  if (!(await fileExists(paths.configPath))) {
    return { manifest: defaultManifest };
  }

  const parsed = parseJsonObject(await readFile(paths.configPath, "utf8"), paths.configPath);

  return {
    manifest: mergeManifest(defaultManifest, parsed),
    configPath: paths.configPath
  };
}

function parseJsonObject(content: string, source: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);

  if (!isRecord(parsed)) {
    throw new ApoloError(`${source} must contain a JSON object.`, {
      code: "CONFIG_INVALID",
      exitCode: 78
    });
  }

  return parsed;
}

function mergeManifest(defaultManifest: ApoloManifest, config: Record<string, unknown>): ApoloManifest {
  return {
    ...defaultManifest,
    project: {
      ...defaultManifest.project,
      name: readNestedString(config, ["project", "name"]) ?? defaultManifest.project.name
    }
  };
}

function readNestedString(source: Record<string, unknown>, path: readonly string[]): string | undefined {
  let current: unknown = source;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return typeof current === "string" ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
