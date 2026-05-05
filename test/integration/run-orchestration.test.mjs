import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { main } from "../../dist/cli/main.js";

test("apolo run --from-plan requires explicit approval before side effects", async () => {
  const workspace = await createWorkspace();
  const planPath = path.join(workspace.cwd, "plan.json");
  await writeFile(planPath, `${JSON.stringify(createPlan({ approved: false }), null, 2)}\n`, "utf8");

  const run = await runCli(["run", "--from-plan", planPath, "--fake-agent"], workspace.cwd, workspace.home);

  assert.equal(run.code, 2);
  assert.match(run.stdout, /APOLO run state: approval_required/);
  const ledgerPath = ledgerPathFromOutput(run.stdout);
  const ledger = await readFile(ledgerPath, "utf8");
  assert.match(ledger, /"event":"security.checked"/);
  assert.match(ledger, /"event":"run.paused"/);
  assert.doesNotMatch(ledger, /execution.started/);
});

test("apolo run --from-plan orchestrates fake agents, verification, memory, and PR metadata", async () => {
  const workspace = await createWorkspace();
  const marker = path.join(workspace.cwd, "verified.txt");
  const planPath = path.join(workspace.cwd, "plan.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      createPlan({
        approved: true,
        verifications: [
          {
            name: "node-marker",
            command: ["node", "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok')`]
          }
        ]
      }),
      null,
      2
    )}\n`,
    "utf8"
  );

  const run = await runCli(["run", "--from-plan", planPath, "--fake-agent"], workspace.cwd, workspace.home);

  assert.equal(run.code, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /APOLO run state: completed/);
  const ledgerPath = ledgerPathFromOutput(run.stdout);
  const runDir = path.dirname(ledgerPath);
  const ledger = await readFile(ledgerPath, "utf8");
  assert.match(ledger, /"event":"agents.routed"/);
  assert.match(ledger, /"event":"execution.completed"/);
  assert.match(ledger, /"event":"verification.completed"/);
  assert.match(ledger, /"event":"memory.updated"/);
  assert.match(ledger, /"event":"pr.prepared"/);
  assert.match(ledger, /"state":"completed"/);

  const pr = JSON.parse(await readFile(path.join(runDir, "pr.json"), "utf8"));
  assert.equal(pr.provider, "claude");
  assert.equal(pr.pushPolicy, "no-direct-main-push");
  assert.match(pr.branchName, /^apolo\/run\/integration-plan$/);

  const memory = await readFile(path.join(workspace.cwd, ".apolo", "memory", "runs.jsonl"), "utf8");
  assert.match(memory, /integration-plan/);
  assert.equal(await readFile(marker, "utf8"), "ok");
});

test("apolo run blocks plans that exceed the five-agent gate", async () => {
  const workspace = await createWorkspace();
  const planPath = path.join(workspace.cwd, "too-many-agents.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      createPlan({
        approved: true,
        maxParallelAgents: 6,
        steps: Array.from({ length: 6 }, (_, index) => ({
          id: `step-${index + 1}`,
          agent: `agent-${index + 1}`,
          action: `step ${index + 1}`,
          sideEffects: true
        }))
      }),
      null,
      2
    )}\n`,
    "utf8"
  );

  const run = await runCli(["run", "--from-plan", planPath, "--fake-agent"], workspace.cwd, workspace.home);

  assert.equal(run.code, 1);
  assert.match(run.stdout, /APOLO run state: failed/);
  const ledger = await readFile(ledgerPathFromOutput(run.stdout), "utf8");
  assert.match(ledger, /max_agents/);
  assert.doesNotMatch(ledger, /execution.started/);
});

test("apolo run can resume a completed checkpoint without re-executing", async () => {
  const workspace = await createWorkspace();
  const planPath = path.join(workspace.cwd, "plan.json");
  await writeFile(planPath, `${JSON.stringify(createPlan({ approved: true }), null, 2)}\n`, "utf8");

  const first = await runCli(["run", "--from-plan", planPath, "--fake-agent"], workspace.cwd, workspace.home);
  assert.equal(first.code, 0, `${first.stdout}\n${first.stderr}`);
  const runId = runIdFromOutput(first.stdout);

  const resumed = await runCli(["run", "--resume", runId, "--fake-agent"], workspace.cwd, workspace.home);

  assert.equal(resumed.code, 0, `${resumed.stdout}\n${resumed.stderr}`);
  assert.match(resumed.stdout, /APOLO run state: completed/);
  const ledger = await readFile(ledgerPathFromOutput(resumed.stdout), "utf8");
  assert.match(ledger, /run.resume.noop/);
});

async function createWorkspace() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "apolo-run-repo-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "apolo-run-home-"));
  await mkdir(path.join(cwd, ".git"), { recursive: true });
  await writeFile(path.join(cwd, "README.md"), "# fixture\n", "utf8");
  return { cwd, home };
}

function createPlan(overrides = {}) {
  return {
    version: 1,
    id: "integration-plan",
    title: "Integration plan",
    objective: "Exercise run orchestration",
    approvalRequired: true,
    approved: true,
    maxParallelAgents: 2,
    provider: "claude",
    steps: [
      {
        id: "step-001",
        agent: "planner",
        action: "inspect workspace",
        sideEffects: true
      },
      {
        id: "step-002",
        agent: "qa-runner",
        action: "verify workspace",
        sideEffects: true
      }
    ],
    verifications: [],
    ...overrides
  };
}

async function runCli(args, cwd, home) {
  let stdout = "";
  let stderr = "";
  const code = await main(args, {
    cwd,
    env: {
      HOME: home
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

function ledgerPathFromOutput(stdout) {
  const match = stdout.match(/^ledger: (.+)$/m);
  assert.ok(match?.[1], stdout);
  return match[1];
}

function runIdFromOutput(stdout) {
  const match = stdout.match(/^run id: (.+)$/m);
  assert.ok(match?.[1], stdout);
  return match[1];
}
