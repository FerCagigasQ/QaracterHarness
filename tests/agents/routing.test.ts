import { describe, expect, it } from "vitest";
import {
  classifyTask,
  routeAgents,
  RoutingError,
  type RoutingRequest
} from "../../src/agents/routing.js";
import type { AgentDetection } from "../../src/agents/detection.js";
import { AGENT_PROVIDERS, MAX_AGENTS_PER_TASK, type AgentId } from "../../src/agents/catalog.js";

function fakeDetection(id: AgentId, installed = true): AgentDetection {
  const provider = AGENT_PROVIDERS.find((p) => p.id === id);
  if (provider === undefined) {
    throw new Error(`unknown provider: ${id}`);
  }
  return {
    id,
    displayName: provider.displayName,
    installed,
    executable: installed ? `/fake/bin/${provider.executableCandidates[0]}` : null,
    version: installed ? "1.0.0" : null,
    capabilities: provider.capabilities,
    prCapable: provider.capabilities.prCapable,
    checkedCandidates: provider.executableCandidates,
    missingReason: installed ? null : "not found"
  };
}

function allInstalled(): AgentDetection[] {
  return AGENT_PROVIDERS.map((p) => fakeDetection(p.id, true));
}

describe("classifyTask", () => {
  it("classifies security prompts", () => {
    expect(classifyTask("fix security vulnerability")).toBe("security");
  });

  it("classifies performance prompts", () => {
    expect(classifyTask("optimize slow database queries")).toBe("performance");
  });

  it("classifies bug prompts", () => {
    expect(classifyTask("fix broken tests")).toBe("bug");
  });

  it("classifies feature prompts", () => {
    expect(classifyTask("implement user notifications")).toBe("feature");
  });

  it("defaults to simple", () => {
    expect(classifyTask("describe the architecture")).toBe("simple");
  });
});

describe("routeAgents", () => {
  it("selects only installed agents, never missing", () => {
    const detections = [
      fakeDetection("claude-code", true),
      fakeDetection("codex-cli", false),
      fakeDetection("ollama-qwen", true)
    ];

    const decision = routeAgents({ prompt: "explain code" }, detections);
    const ids = decision.selectedAgents.map((a) => a.id);
    expect(ids).not.toContain("codex-cli");
    expect(ids.every((id) => detections.find((d) => d.id === id)?.installed)).toBe(true);
  });

  it("never selects more than MAX_AGENTS_PER_TASK", () => {
    const decision = routeAgents({ prompt: "implement feature" }, allInstalled());
    expect(decision.selectedAgents.length).toBeLessThanOrEqual(MAX_AGENTS_PER_TASK);
  });

  it("throws when no agents are installed", () => {
    const detections = AGENT_PROVIDERS.map((p) => fakeDetection(p.id, false));
    expect(() => routeAgents({ prompt: "test" }, detections)).toThrow(RoutingError);
  });

  it("only routes PR-capable agents when requirePr is true", () => {
    const decision = routeAgents(
      { prompt: "fix bug and open PR", requirePr: true },
      allInstalled()
    );

    for (const agent of decision.selectedAgents) {
      expect(agent.prCapable).toBe(true);
    }
  });

  it("PR-capable agents are only Claude and Codex", () => {
    const prCapable = AGENT_PROVIDERS.filter((p) => p.capabilities.prCapable);
    expect(prCapable.map((p) => p.id).sort()).toEqual(["claude-code", "codex-cli"]);
  });

  it("uses claude-code as coordinator when available", () => {
    const decision = routeAgents({ prompt: "add feature" }, allInstalled());
    expect(decision.coordinator).toBe("claude-code");
  });

  it("falls back to first selected agent when claude-code is missing", () => {
    const detections = [
      fakeDetection("claude-code", false),
      fakeDetection("codex-cli", true),
      fakeDetection("ollama-qwen", true)
    ];
    const decision = routeAgents({ prompt: "explain code" }, detections);
    expect(decision.coordinator).not.toBe("claude-code");
    expect(decision.coordinator).toBe(decision.selectedAgents[0]!.id);
  });

  it("rejects maxAgents outside 1-5 range", () => {
    expect(() => routeAgents({ prompt: "test", maxAgents: 0 }, allInstalled())).toThrow(RoutingError);
    expect(() => routeAgents({ prompt: "test", maxAgents: 6 }, allInstalled())).toThrow(RoutingError);
  });

  it("routes explicitly requested agent IDs if all installed", () => {
    const request: RoutingRequest = {
      prompt: "test",
      requestedAgentIds: ["ollama-qwen", "codex-cli"]
    };
    const decision = routeAgents(request, allInstalled());
    expect(decision.selectedAgents.map((a) => a.id)).toEqual(["ollama-qwen", "codex-cli"]);
  });

  it("skips missing agents from skippedMissingAgentIds", () => {
    const detections = [
      fakeDetection("claude-code", true),
      fakeDetection("codex-cli", false),
      fakeDetection("ollama-qwen", false)
    ];
    const decision = routeAgents({ prompt: "test" }, detections);
    expect(decision.skippedMissingAgentIds).toContain("codex-cli");
    expect(decision.skippedMissingAgentIds).toContain("ollama-qwen");
  });

  it("includes command pattern in selected agents", () => {
    const detections = [fakeDetection("claude-code", true)];
    const decision = routeAgents({ prompt: "hello world" }, detections);
    const claude = decision.selectedAgents.find((a) => a.id === "claude-code");
    expect(claude).toBeDefined();
    expect(claude!.command).toContain("/fake/bin/claude");
    expect(claude!.command).toContain("hello world");
  });

  it("includes machineReadableCommand when preferJson and provider supports it", () => {
    const detections = [fakeDetection("claude-code", true)];
    const decision = routeAgents({ prompt: "hello", preferJson: true }, detections);
    const claude = decision.selectedAgents.find((a) => a.id === "claude-code");
    expect(claude!.machineReadableCommand).not.toBeNull();
    expect(claude!.machineReadableCommand).toContain("json");
  });

  it("machineReadableCommand is null when provider does not support JSON", () => {
    const detections = [fakeDetection("ollama-qwen", true)];
    const decision = routeAgents({ prompt: "hello", preferJson: true }, detections);
    const ollama = decision.selectedAgents.find((a) => a.id === "ollama-qwen");
    expect(ollama!.machineReadableCommand).toBeNull();
  });


  it("routes to ollama-qwen when it is the only installed performance-capable agent", () => {
    const detections = [fakeDetection("ollama-qwen", true)];
    const decision = routeAgents({ prompt: "optimize slow local analysis", task: "performance" }, detections);
    expect(decision.selectedAgents.map((a) => a.id)).toEqual(["ollama-qwen"]);
  });

  it("routes to opencode when it is the only installed bug-capable agent", () => {
    const detections = [fakeDetection("opencode", true)];
    const decision = routeAgents({ prompt: "fix broken behavior", task: "bug" }, detections);
    expect(decision.selectedAgents.map((a) => a.id)).toEqual(["opencode"]);
  });

  it("routes to gemini-cli when it is the only installed simple-capable agent", () => {
    const detections = [fakeDetection("gemini-cli", true)];
    const decision = routeAgents({ prompt: "summarize the codebase", task: "simple" }, detections);
    expect(decision.selectedAgents.map((a) => a.id)).toEqual(["gemini-cli"]);
  });

  it("reports max 5 agents constant", () => {
    expect(MAX_AGENTS_PER_TASK).toBe(5);
  });
});
