import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("security gates", () => {
  it("uses TypeScript security gate foundations", () => {
    const gates = readFileSync(path.join(repoRoot, "src/security/gates.ts"), "utf8");
    const redaction = readFileSync(path.join(repoRoot, "src/security/redaction.ts"), "utf8");

    assert.match(gates, /class SecurityGateEngine/);
    assert.match(gates, /sync_side_effect/);
    assert.match(redaction, /redactText/);
  });
});
