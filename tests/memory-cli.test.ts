import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli/main.js";

describe("typescript memory cli", () => {
  it("adds, lists, searches, shows, and exports sanitized local memory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-memory-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-memory-home-"));

    const add = await runCli([
      "memory",
      "add",
      "--title",
      "Storage decision",
      "--body",
      "Use password=DUMMY_SECRET_VALUE_123456 in test only",
      "--type",
      "decision",
      "--tag",
      "storage"
    ], cwd, home);
    expect(add.code).toBe(0);
    const id = add.stdout.match(/Added memory ([^\n]+)/)?.[1];
    expect(id).toBeTruthy();

    const list = await runCli(["memory", "list"], cwd, home);
    expect(list.stdout).toContain("Storage decision");

    const search = await runCli(["memory", "search", "storage"], cwd, home);
    expect(search.stdout).toContain("Storage decision");

    const show = await runCli(["memory", "show", id ?? ""], cwd, home);
    expect(show.stdout).toContain("[REDACTED_SECRET]");
    expect(show.stdout).not.toContain("DUMMY_SECRET_VALUE_123456");

    const exported = await runCli(["memory", "export", "--format", "json"], cwd, home);
    expect(exported.stdout).toContain("[REDACTED_SECRET]");

    const persisted = await readFile(join(cwd, ".apolo", "memory", "repo.jsonl"), "utf8");
    expect(persisted).toContain("[REDACTED_SECRET]");
    expect(persisted).not.toContain("DUMMY_SECRET_VALUE_123456");
  });

  it("handles equals-style flags before positional args and exports more than list default", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-memory-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-memory-home-"));

    for (let index = 0; index < 25; index += 1) {
      const add = await runCli([
        "memory",
        "add",
        "--title",
        `Memory ${index}`,
        "--body",
        `Body ${index}`,
        "--type=observation"
      ], cwd, home);
      expect(add.code).toBe(0);
    }

    const search = await runCli(["memory", "search", "--namespace=repo", "Memory 24"], cwd, home);
    expect(search.code).toBe(0);
    expect(search.stdout).toContain("Memory 24");

    const exported = await runCli(["memory", "export", "--format=json"], cwd, home);
    expect(exported.code).toBe(0);
    expect(JSON.parse(exported.stdout)).toHaveLength(25);
  });
});

interface CapturedRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCli(args: readonly string[], cwd: string, home: string): Promise<CapturedRun> {
  let stdout = "";
  let stderr = "";
  const code = await main(args, {
    cwd,
    env: { HOME: home },
    isInteractive: false,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    readLine: async () => ""
  });
  return { code, stdout, stderr };
}
