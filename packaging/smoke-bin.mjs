import { mkdtempSync, rmSync } from "node:fs";
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

try {
  const packOutput = run("npm", ["pack", "--json", "--pack-destination", temp]);
  const packInfo = JSON.parse(packOutput)[0];
  const tarball = join(temp, packInfo.filename);
  const prefix = join(temp, "prefix");

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

  const doctor = run(apoloBin, ["doctor", "--dry-run"], { cwd: temp });
  const parsed = JSON.parse(doctor);
  if (parsed.command !== "doctor" || parsed.approval !== "always" || parsed.maxAgents !== 5) {
    throw new Error(`Unexpected doctor dry-run output: ${doctor}`);
  }

  run(apoloBin, ["agents", "--help"], { cwd: temp });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
