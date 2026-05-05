import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ApoloError } from "../core/errors.js";
import { CONFIG_FILE_NAME, MANIFEST_FILE_NAME } from "../config/manifest.js";

export interface Env {
  readonly [key: string]: string | undefined;
}

export interface ApoloPaths {
  readonly globalHome: string;
  readonly globalMemoryDb: string;
  readonly repoHome: string;
  readonly repoMemoryDb: string;
  readonly manifestPath: string;
  readonly configPath: string;
}

export function resolveHome(env: Env): string {
  const home = env.HOME ?? env.USERPROFILE;

  if (!home) {
    throw new ApoloError("Unable to resolve a home directory.", {
      code: "CONFIG_INVALID",
      exitCode: 78,
      hint: "Set HOME or APOLO_HOME before running apolo."
    });
  }

  return home;
}

export function resolveApoloPaths(cwd: string, env: Env): ApoloPaths {
  const globalHome = env.APOLO_HOME ?? join(resolveHome(env), ".apolo");
  const repoHome = join(cwd, ".apolo");

  return {
    globalHome,
    globalMemoryDb: join(globalHome, "memory", "global.sqlite"),
    repoHome,
    repoMemoryDb: join(repoHome, "memory", "repo.sqlite"),
    manifestPath: join(repoHome, MANIFEST_FILE_NAME),
    configPath: join(cwd, CONFIG_FILE_NAME)
  };
}

export async function ensureRepoLayout(paths: ApoloPaths): Promise<void> {
  await mkdir(join(paths.globalHome, "memory"), { recursive: true });
  await mkdir(join(paths.repoHome, "memory"), { recursive: true });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
