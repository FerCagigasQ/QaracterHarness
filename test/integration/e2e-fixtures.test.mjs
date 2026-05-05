import assert from "node:assert/strict";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const fixturesRoot = join(root, "test", "fixtures", "e2e");

test("node repository fixture models npm verification", () => {
  const packageJson = JSON.parse(readFileSync(join(fixturesRoot, "node-repo", "package.json"), "utf8"));

  assert.equal(packageJson.name, "apolo-e2e-node-repo");
  assert.deepEqual(Object.keys(packageJson.scripts), ["lint", "typecheck", "build", "test"]);
  assert.equal(existsSync(join(fixturesRoot, "node-repo", "requirements.txt")), false);
});

test("python target repository fixture remains target verification only", () => {
  assert.equal(existsSync(join(fixturesRoot, "python-target-repo", "pyproject.toml")), true);
  assert.equal(existsSync(join(fixturesRoot, "python-target-repo", "tests", "test_sample.py")), true);
  assert.equal(existsSync(join(fixturesRoot, "python-target-repo", "package.json")), false);
});

test("repository without tests fixture has no detectable test metadata", () => {
  const fixture = join(fixturesRoot, "repo-without-tests");

  assert.equal(existsSync(join(fixture, "README.md")), true);
  assert.equal(existsSync(join(fixture, "package.json")), false);
  assert.equal(existsSync(join(fixture, "pyproject.toml")), false);
  assert.equal(existsSync(join(fixture, "tests")), false);
});

test("simulated secret fixture uses dummy-only marker", () => {
  const content = readFileSync(join(fixturesRoot, "repo-with-secret", "sample.txt"), "utf8");

  assert.match(content, /FAKE_SECRET_FOR_APOLO_TESTS_ONLY/);
  assert.doesNotMatch(content, /(?:sk|ghp|glpat|xoxb|AKIA)[A-Za-z0-9_=-]{12,}/i);
});

test("fake agent bins are available for PATH-based E2E validation", () => {
  const manifest = JSON.parse(readFileSync(join(fixturesRoot, "agent-fake-bins", "agents.json"), "utf8"));

  for (const agent of manifest.agents) {
    const commandPath = join(fixturesRoot, "agent-fake-bins", manifest.fakeBinDirectory, agent.command);
    accessSync(commandPath, constants.X_OK);
  }
});
