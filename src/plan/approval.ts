import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveApoloPaths, type Env } from "../fs/layout.js";
import type { ApprovalStatus, PlanRecord } from "./types.js";

export interface ApprovalRecord {
  planId: string;
  status: ApprovalStatus;
  planPath: string;
  createdAt: string;
  updatedAt: string;
}

const approvalsDir = (cwd: string, env: Env = process.env): string =>
  resolveApoloPaths(cwd, env).approvalsDir;

export const approvalPathFor = (cwd: string, planId: string, env: Env = process.env): string =>
  path.join(approvalsDir(cwd, env), `${planId}.json`);

export const writePendingApproval = async (
  cwd: string,
  env: Env,
  plan: PlanRecord,
  planPath: string,
): Promise<string> => {
  const approvalPath = approvalPathFor(cwd, plan.id, env);
  await fs.mkdir(path.dirname(approvalPath), { recursive: true });
  const record: ApprovalRecord = {
    planId: plan.id,
    status: "pending",
    planPath,
    createdAt: plan.createdAt,
    updatedAt: plan.createdAt,
  };
  await fs.writeFile(approvalPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return approvalPath;
};

export const readApproval = async (
  cwd: string,
  planId: string,
  env: Env = process.env,
): Promise<ApprovalRecord> => {
  const content = await fs.readFile(approvalPathFor(cwd, planId, env), "utf8");
  const parsed = JSON.parse(content) as ApprovalRecord;
  if (parsed.planId !== planId) {
    throw new Error(`Approval record mismatch for plan ${planId}`);
  }
  return parsed;
};

export const setApprovalStatus = async (
  cwd: string,
  env: Env,
  planId: string,
  status: ApprovalStatus,
  now = new Date(),
): Promise<ApprovalRecord> => {
  const record = await readApproval(cwd, planId, env);
  const updated: ApprovalRecord = {
    ...record,
    status,
    updatedAt: now.toISOString(),
  };
  await fs.writeFile(approvalPathFor(cwd, planId, env), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
};
