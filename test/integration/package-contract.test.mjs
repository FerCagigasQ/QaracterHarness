import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("package exposes the apolo binary", () => {
  assert.equal(packageJson.name, "apolo-cli");
  assert.equal(packageJson.bin.apolo, "./packaging/bin/apolo.mjs");
  assert.ok(statSync(join(root, packageJson.bin.apolo)).isFile());
});

test("package has validation scripts", () => {
  for (const script of ["typecheck", "package:check", "test", "test:python", "smoke:bin", "ci"]) {
    assert.equal(typeof packageJson.scripts[script], "string", `missing ${script}`);
  }
});

test("example config follows MVP defaults", () => {
  const config = JSON.parse(readFileSync(join(root, "examples/apolo.config.example.json"), "utf8"));

  assert.equal(config.defaults.coordinator, "claude");
  assert.equal(config.defaults.localModel.provider, "ollama");
  assert.equal(config.defaults.localModel.model, "qwen");
  assert.equal(config.defaults.maxAgents, 5);
  assert.equal(config.defaults.humanApproval, "always");
  assert.ok(config.agents.length <= 5);
  assert.ok(config.agents.every((agent) => agent.requiresApproval));
});
