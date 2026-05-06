import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { resolveApoloPaths, type Env } from "../fs/layout.js";
import type { RunFinalState } from "./types.js";

export interface LedgerEvent {
  readonly sequence: number;
  readonly timestamp: string;
  readonly event: string;
  readonly state?: RunFinalState;
  readonly payload: Record<string, unknown>;
}

export interface RunCheckpoint {
  readonly runId: string;
  readonly planPath: string;
  readonly state: RunFinalState;
  readonly sequence: number;
  readonly updatedAt: string;
}

export class RunLedger {
  readonly runId: string;
  readonly runDir: string;
  readonly ledgerPath: string;
  readonly checkpointPath: string;
  private sequence = 0;

  private constructor(cwd: string, env: Env, runId: string) {
    this.runId = runId;
    this.runDir = join(resolveApoloPaths(cwd, env).repoHome, "runs", runId);
    this.ledgerPath = join(this.runDir, "ledger.jsonl");
    this.checkpointPath = join(this.runDir, "checkpoint.json");
  }

  static create(cwd: string, env: Env, runId?: string): RunLedger {
    return new RunLedger(cwd, env, runId ?? createRunId());
  }

  async initialize(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
    this.sequence = await this.readLastSequence();
  }

  async record(event: string, payload: Record<string, unknown> = {}, state?: RunFinalState): Promise<LedgerEvent> {
    await mkdir(this.runDir, { recursive: true });
    const ledgerEvent: LedgerEvent = {
      sequence: this.sequence + 1,
      timestamp: new Date().toISOString(),
      event,
      payload
    };
    const eventWithState = state === undefined ? ledgerEvent : { ...ledgerEvent, state };
    this.sequence = eventWithState.sequence;
    await appendFile(this.ledgerPath, `${JSON.stringify(eventWithState)}\n`, "utf8");
    return eventWithState;
  }

  async checkpoint(planPath: string, state: RunFinalState): Promise<RunCheckpoint> {
    const checkpoint: RunCheckpoint = {
      runId: this.runId,
      planPath,
      state,
      sequence: this.sequence,
      updatedAt: new Date().toISOString()
    };
    await writeFile(this.checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return checkpoint;
  }

  async readCheckpoint(): Promise<RunCheckpoint> {
    const parsed: unknown = JSON.parse(await readFile(this.checkpointPath, "utf8"));
    if (!isRecord(parsed)) {
      throw new Error(`Invalid checkpoint at ${this.checkpointPath}`);
    }
    const runId = readString(parsed, "runId");
    const planPath = readString(parsed, "planPath");
    const state = readString(parsed, "state");
    const sequence = parsed.sequence;
    if (!isRunFinalState(state) || typeof sequence !== "number") {
      throw new Error(`Invalid checkpoint at ${this.checkpointPath}`);
    }
    return {
      runId,
      planPath,
      state,
      sequence,
      updatedAt: readString(parsed, "updatedAt")
    };
  }

  private async readLastSequence(): Promise<number> {
    try {
      const content = await readFile(this.ledgerPath, "utf8");
      const lastLine = content.trim().split("\n").filter(Boolean).at(-1);
      if (!lastLine) {
        return 0;
      }
      const parsed: unknown = JSON.parse(lastLine);
      return isRecord(parsed) && typeof parsed.sequence === "number" ? parsed.sequence : 0;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return 0;
      }
      throw error;
    }
  }
}

export function createRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Checkpoint field ${key} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRunFinalState(value: string): value is RunFinalState {
  return (
    value === "approval_required" ||
    value === "running" ||
    value === "failed" ||
    value === "verification_failed" ||
    value === "completed" ||
    value === "needs_review"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
