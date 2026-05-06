import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { AgentAssignment, ExecutionResult, RunMode, RunPlan } from "./types.js";

export interface AgentExecutor {
  execute(plan: RunPlan, assignments: readonly AgentAssignment[], cwd: string): Promise<readonly ExecutionResult[]>;
}

export class DryRunExecutor implements AgentExecutor {
  async execute(_plan: RunPlan, assignments: readonly AgentAssignment[]): Promise<readonly ExecutionResult[]> {
    return assignments.flatMap((assignment) =>
      assignment.steps.map((step) => ({
        agent: assignment.agent,
        stepId: step.id,
        status: "skipped",
        summary: `Dry run skipped side effects for ${step.action}.`
      }))
    );
  }
}

export class FakeAgentExecutor implements AgentExecutor {
  async execute(_plan: RunPlan, assignments: readonly AgentAssignment[]): Promise<readonly ExecutionResult[]> {
    return assignments.flatMap((assignment) =>
      assignment.steps.map((step) => ({
        agent: assignment.agent,
        stepId: step.id,
        status: "completed",
        summary: `Fake agent ${assignment.agent} completed ${step.id}.`
      }))
    );
  }
}

export class CommandAgentExecutor implements AgentExecutor {
  async execute(plan: RunPlan, assignments: readonly AgentAssignment[], cwd: string): Promise<readonly ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    for (const assignment of assignments) {
      for (const step of assignment.steps) {
        if (!step.commandSpec) {
          results.push({
            agent: assignment.agent,
            stepId: step.id,
            status: "needs_review",
            summary: `No command spec was provided for ${step.id}; adapter handoff is required.`
          });
          continue;
        }

        const [command, ...args] = step.commandSpec.command;
        if (!command) {
          results.push({
            agent: assignment.agent,
            stepId: step.id,
            status: "failed",
            summary: `Empty command spec for ${step.id}.`
          });
          continue;
        }

        const completed = await runCommand(command, args, resolve(cwd, step.commandSpec.cwd ?? "."));
        results.push({
          agent: assignment.agent,
          stepId: step.id,
          status: completed.exitCode === 0 ? "completed" : "failed",
          summary: `${plan.id}:${step.id} exited with ${completed.exitCode}.`,
          exitCode: completed.exitCode
        });
      }
    }
    return results;
  }
}

export function createExecutor(mode: RunMode, fakeAgent: boolean): AgentExecutor {
  if (fakeAgent) {
    return new FakeAgentExecutor();
  }
  if (mode === "dry_run") {
    return new DryRunExecutor();
  }
  return new CommandAgentExecutor();
}

async function runCommand(command: string, args: readonly string[], cwd: string): Promise<{ exitCode: number }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "ignore",
      shell: false,
      env: process.env
    });
    child.on("error", () => resolvePromise({ exitCode: 127 }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1 }));
  });
}
