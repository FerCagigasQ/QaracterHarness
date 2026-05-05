import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli/main.js";

const FIXTURES_ROOT = join(import.meta.dirname, "fixtures");

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

  it("initializes generic APOLO harness artifacts", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const run = await runCli(["init"], cwd, home);

    expect(run.code).toBe(0);
    const manifest = await readFile(join(cwd, ".apolo", "manifest.json"), "utf8");
    expect(manifest).toContain('"provider": "claude"');
    expect(manifest).toContain('"defaultModel": "qwen"');
    expect(manifest).toContain('"backends": [\n      "typescript"\n    ]');
    expect(manifest).not.toContain('"python"');
    expect(manifest).toContain('"maxPerTask": 5');
    expect(manifest).toContain('"initMode": "pull-request"');
    expect(manifest).toContain('"directMain": false');
    expect(manifest).toContain('"typescript"');
    expect(manifest).not.toContain('"python"');
    expect(manifest).toContain('"driver": "jsonl"');
  });

  it("uses APOLO_HOME as the global APOLO directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const apoloHome = await mkdtemp(join(tmpdir(), "apolo-global-"));
    const run = await runCli(["doctor"], cwd, home, { APOLO_HOME: apoloHome });

    expect(run.code).toBe(0);
    expect(run.stdout).toContain(`global memory: ${join(apoloHome, "memory", "global.jsonl")}`);
    expect(run.stdout).not.toContain(join(apoloHome, ".apolo"));
  });

  it("reports doctor defaults before initialization", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const run = await runCli(["doctor"], cwd, home);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("coordinator: claude");
    expect(run.stdout).toContain("node: ");
    expect(run.stdout).toContain("npm: ");
    expect(run.stdout).toContain("git: ");
    expect(run.stdout).toContain("python: ");
    expect(run.stdout).toContain("optional");
    expect(run.stdout).toContain("approval: always");
    expect(run.stdout).toContain("ollama default model: qwen");
    expect(run.stdout).toContain("max agents per task: 5");
  });

  it("returns structured JSON for doctor output", async () => {
    const run = await runCli(["doctor", "--format", "json"]);

    expect(run.code).toBe(0);
    expect(run.stderr).toBe("");
    const payload = JSON.parse(run.stdout);
    expect(payload).toMatchObject({
      ok: true,
      command: "doctor",
      exitCode: 0
    });
    expect(payload.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "node" }),
        expect.objectContaining({ name: "npm" }),
        expect.objectContaining({ name: "git" }),
        expect.objectContaining({ name: "python" })
      ])
    );
    expect(payload.data.checks.find((check: { name: string }) => check.name === "python").detail).toContain("optional");
  });

  it("requires approval before run in non-interactive mode", async () => {
    const run = await runCli(["run", "example task"]);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain("requires explicit human approval");
  });

  it("returns explicit not-implemented for run business logic after approval", async () => {
    const run = await runCli(["run", "example task", "--approve"]);

    expect(run.code).toBe(64);
    expect(run.stderr).toContain("not implemented in the TypeScript runtime yet");
    expect(run.stderr).toContain("run orchestration workstream");
  });

  it("returns structured JSON for CLI errors", async () => {
    const run = await runCli(["unknown", "--json"]);

    expect(run.code).toBe(2);
    expect(run.stdout).toBe("");
    const payload = JSON.parse(run.stderr);
    expect(payload).toMatchObject({
      ok: false,
      exitCode: 2,
      error: {
        code: "UNKNOWN_COMMAND",
        message: "Unknown command: unknown"
      }
    });
  });

  it("keeps unknown command errors human-readable when --format is absent", async () => {
    const run = await runCli(["json"]);

    expect(run.code).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("[apolo] error: Unknown command: json");
    expect(() => JSON.parse(run.stderr)).toThrow();
  });

  it("returns structured not-implemented errors for workstream-owned commands", async () => {
    const run = await runCli(["plan", "--task", "Add a feature", "--format", "json"]);

    expect(run.code).toBe(64);
    const payload = JSON.parse(run.stderr);
    expect(payload).toMatchObject({
      ok: false,
      exitCode: 64,
      error: {
        code: "NOT_IMPLEMENTED"
      }
    });
  });

  it("writes a read-only plan artifact under .apolo/plans", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    await writeFile(join(cwd, "README.md"), "# Fixture\n\nPlanning context.", "utf8");
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0", scripts: { lint: "tsc", test: "vitest" } }),
      "utf8"
    );

    const run = await runCli(["plan", "--task", "Add parser tests"], cwd, home, {
      APOLO_PLAN_DISABLE_CLAUDE: "1"
    });

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Plan artifact written:");
    const artifactPath = run.stdout.match(/Plan artifact written: (.+\.md)/)?.[1];
    expect(artifactPath).toBeDefined();
    expect(artifactPath).toContain(join(cwd, ".apolo", "plans"));
    const artifact = await readFile(artifactPath as string, "utf8");
    expect(artifact).toContain("## Objective");
    expect(artifact).toContain("## Non-goals");
    expect(artifact).toContain("## Assumptions");
    expect(artifact).toContain("## Risks");
    expect(artifact).toContain("## Probable files");
    expect(artifact).toContain("## Agent allocation (max 5)");
    expect(artifact).toContain("## Verification commands");
    expect(artifact).toContain("## Acceptance criteria");
    expect(artifact).toContain("## Approval checkpoints");
    expect(artifact).toContain("npm run lint");
    expect(artifact).toContain("Approval required before run: yes");
  });

  it("supports dry-run JSON without writing a plan file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const run = await runCli(["plan", "--task", "Review CLI UX", "--dry-run", "--format", "json"], cwd, home, {
      APOLO_PLAN_DISABLE_CLAUDE: "1"
    });

    expect(run.code).toBe(0);
    const parsed = JSON.parse(run.stdout);
    expect(parsed.task).toBe("Review CLI UX");
    expect(parsed.dryRun).toBe(true);
    expect(parsed.planner).toBe("deterministic-fallback");
    expect(parsed.artifactPath).toContain(join(cwd, ".apolo", "plans"));
    expect(parsed.plan.agentAllocation.length).toBeLessThanOrEqual(5);
    await expect(readFile(parsed.artifactPath, "utf8")).rejects.toThrow();
  });

  it("rejects plan without --task", async () => {
    const run = await runCli(["plan", "--dry-run"]);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain("apolo plan requires --task");
  });

  it("runs an approved JSON plan through the fake agent adapter", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "apolo-repo-"));
    const home = await mkdtemp(join(tmpdir(), "apolo-home-"));
    const planPath = join(cwd, "plan.json");
    await writeFile(
      planPath,
      `${JSON.stringify({
        version: 1,
        id: "cli-plan",
        title: "CLI plan",
        objective: "Exercise CLI run",
        approvalRequired: true,
        approved: true,
        maxParallelAgents: 1,
        steps: [
          {
            id: "step-001",
            agent: "planner",
            action: "inspect",
            sideEffects: true
          }
        ],
        verifications: []
      })}\n`,
      "utf8"
    );

    const run = await runCli(["run", "--from-plan", planPath, "--fake-agent"], cwd, home);

    expect(run.code).toBe(0);
    expect(run.stdout).toContain("APOLO run state: completed");
    expect(run.stdout).toContain("ledger:");
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

async function fixtureWorkspace(name: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "apolo-fixture-"));
  await cp(join(FIXTURES_ROOT, name), cwd, { recursive: true });
  return cwd;
}
