import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJsonPath = join(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  assert(result.status === 0, [
    `Command failed: ${command} ${args.join(" ")}`,
    result.stdout,
    result.stderr
  ].filter(Boolean).join("\n"));
  return result.stdout.trim();
}

assert(packageJson.name === "apolo-cli", "package name must remain apolo-cli");
assert(typeof packageJson.version === "string", "package version is required");
assert(packageJson.engines?.node === ">=20", "Node.js engine must be >=20");
assert(packageJson.bin?.apolo === "./dist/index.js", "bin.apolo must point at the built TypeScript CLI");
assert(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0, "runtime package must not have production dependencies");
assert(!packageJson.optionalDependencies?.python, "runtime package must not depend on Python");

const binPath = join(root, packageJson.bin.apolo);
const binStat = statSync(binPath);
assert(binStat.isFile(), "bin.apolo must point to a file");
assert(readFileSync(binPath, "utf8").startsWith("#!/usr/bin/env node"), "bin.apolo must have a Node.js shebang");

const manifestSource = readFileSync(join(root, "src", "config", "defaults.ts"), "utf8");
assert(manifestSource.includes('backends: ["typescript"]'), "default runtime backend must be TypeScript-only");
assert(!manifestSource.includes('"python"'), "default runtime backend must not include Python");

for (const script of ["lint", "typecheck", "package:check", "test", "test:python", "smoke:bin", "ci", "build"]) {
  assert(packageJson.scripts?.[script], `missing npm script: ${script}`);
}

for (const entry of ["dist", "README.md", "CHANGELOG.md", "docs/", "examples/", "package.json"]) {
  assert(packageJson.files?.includes(entry), `package files must include ${entry}`);
}

const packOutput = run("npm", ["pack", "--dry-run", "--json"]);
const packInfo = JSON.parse(packOutput)[0];
const packedPaths = new Set(packInfo.files.map((file) => file.path));

for (const expected of [
  "README.md",
  "CHANGELOG.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/cli/router.js",
  "dist/config/manifest.js",
  "dist/fs/layout.js",
  "docs/packaging.md",
  "docs/usage.md",
  "docs/test-strategy.md",
  "examples/apolo.config.example.json",
  "package.json"
]) {
  assert(packedPaths.has(expected), `npm package missing ${expected}`);
}

for (const forbidden of [
  "packaging/bin/apolo.mjs",
  "packaging/smoke-bin.mjs",
  "packaging/validate-npm-package.mjs",
  "src/index.ts",
  "src/init/detector.py",
  "src/security/gates.py",
  "test/harness/test_cli_contract.py",
  "tests/cli.test.ts"
]) {
  assert(!packedPaths.has(forbidden), `npm package must not include development/runtime source file ${forbidden}`);
}

assert(
  [...packedPaths].every((path) => !path.endsWith(".py")),
  "npm runtime package must not include Python files"
);
