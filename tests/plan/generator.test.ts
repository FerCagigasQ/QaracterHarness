import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readApproval, setApprovalStatus } from "../../src/plan/approval.js";
import { generatePlan } from "../../src/plan/generator.js";
import { parsePlanMarkdown } from "../../src/plan/parser.js";
import { validateRunFromPlan } from "../../src/run/fromPlan.js";

const withRepo = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "apolo-plan-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe("plan generation", () => {
  it("writes a markdown plan and pending approval record", async () => {
    await withRepo(async (dir) => {
      const env = { HOME: path.join(dir, "home") };
      await writeFile(path.join(dir, "package.json"), "{\"scripts\":{\"test\":\"vitest\"}}\n");
      await writeFile(path.join(dir, "apolo.yaml"), "coordinator: claude\nmaxAgents: 5\n");

      const result = await generatePlan({
        cwd: dir,
        env,
        task: "Implement user settings feature",
        planId: "plan-123",
        now: new Date("2026-01-02T03:04:05Z"),
      });

      expect(result.record.id).toBe("plan-123");
      expect(result.record.classification).toBe("feature");
      expect(result.record.approvalStatus).toBe("pending");
      expect(result.record.agents.length).toBeLessThanOrEqual(5);
      expect(await readFile(result.path, "utf8")).toContain("## Approval");

      const approval = await readApproval(dir, "plan-123", env);
      expect(approval.status).toBe("pending");
      expect(approval.planPath).toBe(result.path);
    });
  });

  it("parses plan metadata and key sections from markdown", async () => {
    await withRepo(async (dir) => {
      const result = await generatePlan({
        cwd: dir,
        env: { HOME: path.join(dir, "home") },
        task: "Fix failing parser test",
        planId: "plan-parse",
        now: new Date("2026-01-02T03:04:05Z"),
      });

      const parsed = parsePlanMarkdown(result.markdown);
      expect(parsed.id).toBe("plan-parse");
      expect(parsed.classification).toBe("bugfix");
      expect(parsed.approvalStatus).toBe("pending");
      expect(parsed.task).toBe("Fix failing parser test");
      expect(parsed.uncertainties.length).toBeGreaterThan(0);
    });
  });

  it("parses all items from multi-line list sections", () => {
    const parsed = parsePlanMarkdown(`---
id: plan-lists
createdAt: 2026-01-02T03:04:05.000Z
approvalStatus: pending
classification: feature
risk: medium
agents: 2
expectedMinutes: 45
---

# APOLO Plan plan-lists

## Task
Implement list parsing

## Classification
feature

## Uncertainties
- Line one
- Line two
- Line three

## Strategy
Read-only strategy.

## Likely Files
- src/plan/parser.ts
- tests/plan/generator.test.ts
`);

    expect(parsed.uncertainties).toEqual(["Line one", "Line two", "Line three"]);
    expect(parsed.likelyFiles).toEqual(["src/plan/parser.ts", "tests/plan/generator.test.ts"]);
  });

  it("blocks run handoff until approval and validates approved plans", async () => {
    await withRepo(async (dir) => {
      const env = { HOME: path.join(dir, "home") };
      await writeFile(path.join(dir, "package.json"), "{}\n");
      await generatePlan({
        cwd: dir,
        env,
        task: "Add CLI test coverage",
        planId: "plan-run",
        now: new Date("2026-01-02T03:04:05Z"),
      });

      await expect(validateRunFromPlan(dir, env, "plan-run")).rejects.toThrow(/human approval is required/);

      await setApprovalStatus(dir, env, "plan-run", "approved", new Date("2026-01-02T03:05:00Z"));
      await expect(validateRunFromPlan(dir, env, "plan-run")).resolves.toMatchObject({
        planId: "plan-run",
        approved: true,
        task: "Add CLI test coverage",
      });
    });
  });
});
