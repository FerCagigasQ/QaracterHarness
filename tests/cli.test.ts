import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli/main.js";

interface CapturedRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

describe("apolo cli", () => {
  it("shows the visible command surface", async () => {
    const run = await runCli(["--help"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("apolo init");
    expect(run.stdout).toContain("apolo doctor");
    expect(run.stdout).toContain("apolo agents");
  });

  it("initializes the repository layout and manifest defaults", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const run = await runCli(["init"], cwd, home);

    expect(run.code).toBe(0);
    const manifest = await readFile(join(cwd, ".apolo", "manifest.json"), "utf8");
    expect(manifest).toContain('"provider": "claude"');
    expect(manifest).toContain('"defaultModel": "qwen"');
    expect(manifest).toContain('"maxPerTask": 5');
    expect(manifest).toContain('"initMode": "pull-request"');
    expect(manifest).toContain('"directMain": false');
  });

  it("uses APOLO_HOME as the global APOLO directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const apoloHome = await mkdtemp(join(tmpdir(), "apolo-global-"));
    const run = await runCli(["doctor"], cwd, home, { APOLO_HOME: apoloHome });

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`global memory: ${join(apoloHome, "memory", "global.sqlite")}`);
    expect(run.stdout).not.toContain(join(apoloHome, ".apolo"));
  });

  it("reports doctor defaults before initialization", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const run = await runCli(["doctor"], cwd, home);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("coordinator: claude");
    expect(run.stdout).toContain("approval: always");
    expect(run.stdout).toContain("ollama default model: qwen");
    expect(run.stdout).toContain("max agents per task: 5");
  });

  it("requires approval before run in non-interactive mode", async () => {
    const run = await runCli(["run", "example task"]);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain("requires explicit human approval");
  });

  it("accepts explicit approval for run stub", async () => {
    const run = await runCli(["run", "example task", "--approve"]);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("task execution interface ready");
  });
});

async function runCli(
  args: readonly string[],
  cwd?: string,
  home?: string,
  env: Record<string, string> = {}
): Promise<CapturedRun> {
  let stdout = "";
  let stderr = "";
  const resolvedCwd = cwd ?? (await mkdtemp(join(tmpdir(), "apolo-repo-")));
  const resolvedHome = home ?? (await mkdtemp(join(tmpdir(), "apolo-home-")));
  const code = await main(args, {
    cwd: resolvedCwd,
    env: {
      HOME: resolvedHome,
      ...env
    },
    isInteractive: false,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      }
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      }
    },
    readLine: async () => ""
  });

  return { code, stdout, stderr };
}
