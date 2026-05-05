from __future__ import annotations

from run.types import AgentAssignment, ApprovedPlan, RunRequest


class LogicalAgentRouter:
    def route(self, request: RunRequest, plan: ApprovedPlan) -> tuple[AgentAssignment, ...]:
        agent_count = self._agent_count(request, plan)
        assignments: list[AgentAssignment] = []
        for index in range(agent_count):
            task = plan.tasks[index % len(plan.tasks)] if plan.tasks else plan.objective
            assignments.append(
                AgentAssignment(
                    agent_id=f"logical-agent-{index + 1}",
                    task=task,
                    rationale="Task routing balances approved plan steps across logical execution lanes.",
                )
            )
        return tuple(assignments)

    def _agent_count(self, request: RunRequest, plan: ApprovedPlan) -> int:
        if request.requested_agents is not None:
            return min(max(request.requested_agents, 1), 5)
        task_count = max(len(plan.tasks), 1)
        if task_count == 1:
            return 1
        if task_count <= 3:
            return 2
        return min(5, task_count)
