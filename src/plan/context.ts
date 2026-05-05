import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { PlanContext } from "./types.js";

const readOptional = async (filePath: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

const walkFiles = async (root: string, maxFiles = 250): Promise<string[]> => {
  const ignored = new Set([".git", "node_modules", "dist", ".apolo"]);
  const files: string[] = [];

  const visit = async (dir: string): Promise<void> => {
    if (files.length >= maxFiles) {
      return;
    }
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles || ignored.has(entry.name)) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };

  await visit(root);
  return files.sort();
};

export const buildPlanContext = async (cwd: string, task: string): Promise<PlanContext> => {
  const apoloYaml = await readOptional(path.join(cwd, "apolo.yaml"));
  const memory =
    (await readOptional(path.join(cwd, ".apolo", "memory.md"))) ??
    (await readOptional(path.join(cwd, "memory.md")));
  const harnessSummary =
    (await readOptional(path.join(cwd, "HARNESS.md"))) ??
    (await readOptional(path.join(cwd, "README.md")));

  return {
    cwd,
    task,
    apoloYaml,
    memory,
    harnessSummary,
    files: await walkFiles(cwd),
  };
};
