import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "apolo-smoke-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(" ")}`,
      `exit=${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function runExpectFailure(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options
  });
  if (result.status === 0) {
    throw new Error([
      `Command unexpectedly passed: ${command} ${args.join(" ")}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join("\n"));
  }
  return result;
}

try {
  run("npm", ["run", "build"]);

  const packOutput = run("npm", ["pack", "--json", "--pack-destination", temp]);
  const packInfo = JSON.parse(packOutput)[0];
  const tarball = join(temp, packInfo.filename);
  const prefix = join(temp, "prefix");
  const project = join(temp, "project");
  const home = join(temp, "home");

  run("npm", ["install", "-g", tarball, "--prefix", prefix], { cwd: temp });

  const apoloBin = process.platform === "win32"
    ? join(prefix, "apolo.cmd")
    : join(prefix, "bin", "apolo");

  const version = run(apoloBin, ["--version"], { cwd: temp });
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Unexpected version output: ${version}`);
  }

  const help = run(apoloBin, ["--help"], { cwd: temp });
  for (const command of ["init", "doctor", "plan", "run", "sync", "memory", "agents"]) {
    if (!help.includes(command)) {
      throw new Error(`Help output missing command: ${command}`);
    }
  }

  const doctor = run(apoloBin, ["doctor"], { cwd: temp });
  if (!doctor.includes("approval: always") || !doctor.includes("max agents per task: 5")) {
    throw new Error(`Unexpected doctor dry-run output: ${doctor}`);
  }

  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  const env = { ...process.env, HOME: home, APOLO_HOME: join(home, ".apolo-global") };

  const init = run(apoloBin, ["init"], { cwd: project, env });
  if (!init.includes("Initialized APOLO workspace")) {
    throw new Error(`Unexpected init output: ${init}`);
  }

  const manifest = JSON.parse(readFileSync(join(project, ".apolo", "manifest.json"), "utf8"));
  if (manifest.runtime?.backends?.join(",") !== "typescript") {
    throw new Error(`Unexpected runtime backends: ${JSON.stringify(manifest.runtime)}`);
  }

  const repoDoctor = run(apoloBin, ["doctor"], { cwd: project, env });
  for (const expected of ["coordinator: claude", "approval: always", "max agents per task: 5"]) {
    if (!repoDoctor.includes(expected)) {
      throw new Error(`Doctor output missing ${expected}: ${repoDoctor}`);
    }
  }

  const runDenied = runExpectFailure(apoloBin, ["run", "smoke task"], { cwd: project, env });
  if (runDenied.status !== 2 || !runDenied.stderr.includes("requires explicit human approval")) {
    throw new Error(`Unexpected unapproved run result: ${runDenied.status}\n${runDenied.stderr}`);
  }

  const runApproved = run(apoloBin, ["run", "smoke task", "--approve"], { cwd: project, env });
  if (!runApproved.includes("task execution interface ready")) {
    throw new Error(`Unexpected approved run output: ${runApproved}`);
  }

  const unpack = join(temp, "unpack");
  mkdirSync(unpack, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", unpack], { cwd: temp });
  const installedPackageJson = JSON.parse(readFileSync(join(unpack, "package", "package.json"), "utf8"));
  if (installedPackageJson.dependencies && Object.keys(installedPackageJson.dependencies).length > 0) {
    throw new Error("Packed package must not declare production dependencies.");
  }
  const packedManifest = readFileSync(join(unpack, "package", "dist", "config", "defaults.js"), "utf8");
  if (!packedManifest.includes('backends: ["typescript"]') || packedManifest.includes('"python"')) {
    throw new Error(`Packed defaults are not TypeScript-only: ${packedManifest}`);
  }

  const fakeBinDir = join(temp, "fake-bin");
  mkdirSync(fakeBinDir, { recursive: true });
  const fakeAgent = process.platform === "win32" ? join(fakeBinDir, "claude.cmd") : join(fakeBinDir, "claude");
  writeFileSync(fakeAgent, process.platform === "win32" ? "@echo off\r\necho fake claude\r\n" : "#!/usr/bin/env sh\necho fake claude\n", { mode: 0o755 });
  copyFileSync(fakeAgent, process.platform === "win32" ? join(fakeBinDir, "codex.cmd") : join(fakeBinDir, "codex"));
  if (process.platform !== "win32") {
    chmodSync(fakeAgent, 0o755);
    chmodSync(join(fakeBinDir, "codex"), 0o755);
  }
  const agentsHelp = run(apoloBin, ["agents", "--help"], {
    cwd: project,
    env: {
      ...env,
      PATH: `${fakeBinDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`
    }
  });
  if (!agentsHelp.includes("apolo agents")) {
    throw new Error(`Unexpected agents help output with fake bins: ${agentsHelp}`);
  }

  run(apoloBin, ["agents", "--help"], { cwd: temp });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
