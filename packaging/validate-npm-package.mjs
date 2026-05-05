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
assert(packageJson.bin?.apolo, "bin.apolo is required");

const binPath = join(root, packageJson.bin.apolo);
const binStat = statSync(binPath);
assert(binStat.isFile(), "bin.apolo must point to a file");
assert(readFileSync(binPath, "utf8").startsWith("#!/usr/bin/env node"), "bin.apolo must have a Node.js shebang");

for (const script of ["lint", "typecheck", "package:check", "test", "test:python", "smoke:bin", "ci", "build"]) {
  assert(packageJson.scripts?.[script], `missing npm script: ${script}`);
}

for (const entry of ["dist"]) {
  assert(packageJson.files?.includes(entry), `package files must include ${entry}`);
}

const packOutput = run("npm", ["pack", "--dry-run", "--json"]);
const packInfo = JSON.parse(packOutput)[0];
const packedPaths = new Set(packInfo.files.map((file) => file.path));

for (const expected of [
  "README.md",
  "dist/index.js",
  "dist/cli/router.js",
  "dist/config/manifest.js",
  "dist/fs/layout.js",
  "package.json"
]) {
  assert(packedPaths.has(expected), `npm package missing ${expected}`);
}
