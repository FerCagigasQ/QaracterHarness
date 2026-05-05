import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const commands = ["init", "doctor", "plan", "run", "sync", "memory", "agents"];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("README links required docs", () => {
  const readme = read("README.md");

  for (const doc of [
    "docs/command-reference.md",
    "docs/usage.md",
    "docs/architecture.md",
    "docs/packaging.md",
    "docs/cross-platform.md",
    "docs/test-strategy.md",
    "docs/examples.md"
  ]) {
    assert.ok(readme.includes(doc), `README missing ${doc}`);
  }
});

test("command reference documents every MVP command", () => {
  const commandReference = read("docs/command-reference.md");

  for (const command of commands) {
    assert.ok(commandReference.includes(`apolo ${command}`), `missing apolo ${command}`);
  }
});

test("docs state required MVP policies", () => {
  const combinedDocs = [
    "README.md",
    "docs/architecture.md",
    "docs/command-reference.md",
    "docs/test-strategy.md",
    "docs/usage.md"
  ].map(read).join("\n");

  for (const required of ["Claude", "Qwen", "Ollama", "max 5 agents", "human approval"]) {
    assert.ok(combinedDocs.toLowerCase().includes(required.toLowerCase()), `missing policy: ${required}`);
  }
});
