import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveApoloPaths, type Env } from "../fs/layout.js";
import { readApproval } from "../plan/approval.js";
import { parsePlanMarkdown } from "../plan/parser.js";

export interface RunFromPlanHandoff {
  planId: string;
  planPath: string;
  task: string;
  approved: true;
}

export const planPathFor = (cwd: string, env: Env, planId: string): string =>
  path.join(resolveApoloPaths(cwd, env).plansDir, `${planId}.md`);

export const validateRunFromPlan = async (
  cwd: string,
  env: Env,
  planId: string,
): Promise<RunFromPlanHandoff> => {
  const approval = await readApproval(cwd, planId, env);
  if (approval.status !== "approved") {
    throw new Error(`Plan ${planId} is ${approval.status}; human approval is required before run.`);
  }

  const planPath = approval.planPath || planPathFor(cwd, env, planId);
  const markdown = await fs.readFile(planPath, "utf8");
  const parsed = parsePlanMarkdown(markdown);
  if (parsed.id !== planId) {
    throw new Error(`Plan file id ${parsed.id} does not match requested plan ${planId}`);
  }

  return {
    planId,
    planPath,
    task: parsed.task,
    approved: true,
  };
};
