import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach } from "vitest";
import { detectAgents, type AgentDetection } from "../../src/agents/detection.js";
import { AGENT_PROVIDERS } from "../../src/agents/catalog.js";

async function createFakeBin(binDir: string, name: string): Promise<string> {
  const path = join(binDir, name);
  await writeFile(path, "#!/bin/sh\necho fake-version-1.0.0\n", "utf8");
  await chmod(path, 0o755);
  return path;
}

describe("agent detection", () => {
  let binDir: string;

  beforeEach(async () => {
    binDir = await mkdtemp(join(tmpdir(), "apolo-test-bin-"));
  });

  it("detects all providers as missing when PATH has no matching binaries", async () => {
    const emptyBin = await mkdtemp(join(tmpdir(), "apolo-empty-bin-"));
    const detections = await detectAgents({
      env: { PATH: emptyBin, HOME: "/tmp" },
      timeoutMs: 500
    });

    expect(detections.length).toBe(AGENT_PROVIDERS.length);
    for (const detection of detections) {
      expect(detection.installed).toBe(false);
      expect(detection.executable).toBeNull();
      expect(detection.version).toBeNull();
      expect(detection.missingReason).not.toBeNull();
    }
  });

  it("detects claude as installed when binary exists on PATH", async () => {
    await createFakeBin(binDir, "claude");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const claude = detections.find((d) => d.id === "claude-code");
    expect(claude).toBeDefined();
    expect(claude!.installed).toBe(true);
    expect(claude!.executable).toBe(join(binDir, "claude"));
    expect(claude!.prCapable).toBe(true);
    expect(claude!.capabilities.canCoordinate).toBe(true);
  });

  it("detects codex as installed and PR-capable", async () => {
    await createFakeBin(binDir, "codex");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const codex = detections.find((d) => d.id === "codex-cli");
    expect(codex).toBeDefined();
    expect(codex!.installed).toBe(true);
    expect(codex!.prCapable).toBe(true);
  });

  it("detects ollama/qwen as installed but not PR-capable", async () => {
    await createFakeBin(binDir, "ollama");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const ollama = detections.find((d) => d.id === "ollama-qwen");
    expect(ollama).toBeDefined();
    expect(ollama!.installed).toBe(true);
    expect(ollama!.prCapable).toBe(false);
  });

  it("detects cursor via fallback candidate", async () => {
    await createFakeBin(binDir, "cursor");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const cursor = detections.find((d) => d.id === "cursor-cli");
    expect(cursor).toBeDefined();
    expect(cursor!.installed).toBe(true);
    expect(cursor!.executable).toBe(join(binDir, "cursor"));
  });

  it("detects cursor-agent as primary candidate over cursor", async () => {
    await createFakeBin(binDir, "cursor-agent");
    await createFakeBin(binDir, "cursor");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const cursor = detections.find((d) => d.id === "cursor-cli");
    expect(cursor).toBeDefined();
    expect(cursor!.installed).toBe(true);
    expect(cursor!.executable).toBe(join(binDir, "cursor-agent"));
  });

  it("reports version from fake binary stdout", async () => {
    await createFakeBin(binDir, "gemini");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const gemini = detections.find((d) => d.id === "gemini-cli");
    expect(gemini).toBeDefined();
    expect(gemini!.installed).toBe(true);
    expect(gemini!.version).toBe("fake-version-1.0.0");
  });

  it("reports installed and missing agents together", async () => {
    await createFakeBin(binDir, "claude");
    await createFakeBin(binDir, "ollama");
    const detections = await detectAgents({
      env: { PATH: binDir, HOME: "/tmp" },
      timeoutMs: 500
    });

    const installed = detections.filter((d) => d.installed);
    const missing = detections.filter((d) => !d.installed);
    expect(installed.length).toBe(2);
    expect(missing.length).toBe(AGENT_PROVIDERS.length - 2);
  });

  it("does not exceed 7 providers (all supported CLIs)", () => {
    expect(AGENT_PROVIDERS.length).toBe(7);
  });
});
