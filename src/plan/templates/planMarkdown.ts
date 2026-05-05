import type { PlanRecord } from "../types.js";

const checkbox = (enabled: boolean): string => (enabled ? "x" : " ");

const list = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None detected";

export const renderPlanMarkdown = (plan: PlanRecord): string => {
  const steps = plan.steps
    .map((step) => `${step.id}. ${step.title}\n   - ${step.detail}`)
    .join("\n");
  const agents = plan.agents
    .map((agent) => `- ${agent.name}: ${agent.role}\n  - Reason: ${agent.reason}`)
    .join("\n");
  const verifications = plan.verifications.map((item) => `- [${checkbox(true)}] ${item}`).join("\n");

  return `---
id: ${plan.id}
createdAt: ${plan.createdAt}
approvalStatus: ${plan.approvalStatus}
classification: ${plan.classification}
risk: ${plan.cost.risk}
agents: ${plan.cost.agents}
expectedMinutes: ${plan.cost.expectedMinutes}
---

# APOLO Plan ${plan.id}

## Task
${plan.task}

## Classification
${plan.classification}

## Uncertainties
${list(plan.uncertainties)}

## Strategy
${plan.strategy}

## Steps
${steps}

## Suggested Agents
${agents}

## Verifications
${verifications}

## Risk and Cost
- Risk: ${plan.cost.risk}
- Suggested agents: ${plan.cost.agents}
- Estimated effort: ${plan.cost.expectedMinutes} minutes

## Likely Files
${list(plan.likelyFiles)}

## Approval
- Status: ${plan.approvalStatus}
- Approve with: \`apolo approve ${plan.id}\`
- Run handoff: \`apolo run --from-plan ${plan.id}\`
`;
};
