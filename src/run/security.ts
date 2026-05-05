import type { ApprovalDecision, GateDecision, RunPlan } from "./types.js";
import { uniqueAgents } from "./plan.js";

const sensitivePatterns: readonly RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:bearer|token|api[_-]?key|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}/i,
  /\b[a-z0-9._%+-]+:\/\/[^:\s/]+:[^@\s/]+@/i
];

const destructiveCommandPatterns: readonly RegExp[] = [
  /\brm\s+-rf\s+(?:\/|\*|~)/i,
  /\bgit\s+push\b.*\b(?:main|master)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-f/i,
  /\bsudo\b/i,
  /\bcurl\b.*\|\s*(?:sh|bash)\b/i
];

export function evaluateRunSecurity(plan: RunPlan, approval: ApprovalDecision): readonly GateDecision[] {
  const decisions: GateDecision[] = [];
  const agents = uniqueAgents(plan.steps);

  if (plan.maxParallelAgents > 5) {
    decisions.push(blocked("max_agents", `Plan requests ${plan.maxParallelAgents} agents; maximum is 5.`));
  }

  if (agents.length > 5) {
    decisions.push(blocked("max_agents", `Plan routes ${agents.length} unique agents; maximum is 5.`));
  }

  if (!plan.approvalRequired) {
    decisions.push(blocked("approval_contract", "Plan artifacts must require explicit human approval before run."));
  }

  if (!approval.approved) {
    decisions.push({
      gate: "human_approval",
      allowed: false,
      reason: "Explicit human approval is required before side effects.",
      severity: "approval"
    });
  }

  for (const step of plan.steps) {
    for (const value of [step.action, step.commandSpec?.command.join(" ") ?? ""]) {
      if (containsSensitiveData(value)) {
        decisions.push(blocked("secrets", `Sensitive data detected in step ${step.id}.`));
      }
    }

    const command = step.commandSpec?.command.join(" ");
    if (command) {
      for (const pattern of destructiveCommandPatterns) {
        if (pattern.test(command)) {
          decisions.push(blocked("destructive_command", `Blocked destructive command in step ${step.id}.`));
        }
      }
    }
  }

  return decisions.length === 0
    ? [
        {
          gate: "security",
          allowed: true,
          reason: "Plan passed run security gates.",
          severity: "blocked"
        }
      ]
    : decisions;
}

export function securityAllowsSideEffects(decisions: readonly GateDecision[]): boolean {
  return decisions.every((decision) => decision.allowed);
}

function containsSensitiveData(value: string): boolean {
  return sensitivePatterns.some((pattern) => pattern.test(value));
}

function blocked(gate: string, reason: string): GateDecision {
  return {
    gate,
    allowed: false,
    reason,
    severity: "blocked"
  };
}
