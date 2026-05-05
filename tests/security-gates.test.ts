import { describe, expect, it } from "vitest";
import { redactText } from "../src/security/redaction.js";
import { SecurityGateEngine } from "../src/security/gates.js";

describe("typescript security gates", () => {
  it("redacts simulated secrets without logging raw values", () => {
    const redacted = redactText("api_key=DUMMY_SECRET_VALUE_123456", { allowDummyPlaceholders: false });

    expect(redacted.text).toBe("api_key=[REDACTED_SECRET]");
    expect(redacted.changed).toBe(true);
  });

  it("blocks sensitive paths, dangerous commands, memory secrets, sync side effects, and write scope", () => {
    const decisions = new SecurityGateEngine({
      secrets: { allowDummyPlaceholders: false }
    }).evaluate({
      actor: "claude",
      approvals: { humanRunApproved: true },
      commands: ["git reset --hard HEAD"],
      fileWrites: [
        { path: "../outside.txt", content: "safe" },
        { path: "src/.env", content: "safe" },
        { path: "src/example.ts", content: "password=DUMMY_SECRET_VALUE_123456" }
      ],
      memoryWrites: [{ key: "note", value: "api_key=DUMMY_SECRET_VALUE_123456" }],
      syncSideEffects: [{ target: "remote" }]
    });

    expect(hasBlock(decisions, "destructive_ops")).toBe(true);
    expect(hasBlock(decisions, "write_scope")).toBe(true);
    expect(hasBlock(decisions, "secrets")).toBe(true);
    expect(hasBlock(decisions, "memory_write")).toBe(true);
    expect(hasBlock(decisions, "sync_side_effect")).toBe(true);
  });

  it("keeps memory-write secret scanning active when the generic secrets gate is disabled", () => {
    const decisions = new SecurityGateEngine({
      secrets: { enabled: false, allowDummyPlaceholders: false }
    }).evaluate({
      actor: "claude",
      approvals: { humanRunApproved: true },
      memoryWrites: [{ key: "note", value: "api_key=DUMMY_SECRET_VALUE_123456" }]
    });

    expect(hasBlock(decisions, "secrets")).toBe(false);
    expect(hasBlock(decisions, "memory_write")).toBe(true);
  });

  it("does not deny writes when denied names are only filename substrings", () => {
    const decisions = new SecurityGateEngine().evaluate({
      actor: "claude",
      approvals: { humanRunApproved: true },
      fileWrites: [{ path: "src/credentials_validator.ts", content: "safe" }]
    });

    expect(hasBlock(decisions, "write_scope")).toBe(false);
  });
});

function hasBlock(decisions: readonly { gate: string; allowed: boolean }[], gate: string): boolean {
  return decisions.some((decision) => decision.gate === gate && !decision.allowed);
}
