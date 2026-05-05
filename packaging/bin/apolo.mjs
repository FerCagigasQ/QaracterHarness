#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const commands = ["init", "doctor", "plan", "run", "sync", "memory", "agents"];

function printMainHelp() {
  console.log(`APOLO CLI ${packageJson.version}

Usage:
  apolo <command> [options]

Commands:
  init      Initialize a workspace
  doctor    Check local readiness
  plan      Create a human-reviewable plan
  run       Run an approved plan
  sync      Synchronize approved workspace state
  memory    Manage approved memory entries
  agents    Manage configured agents

Defaults:
  coordinator: claude
  local model: qwen via ollama
  max agents: 5
  approval: always

Options:
  --help       Show help
  --version    Print version
  --dry-run    Preview without side effects`);
}

function printCommandHelp(command) {
  console.log(`apolo ${command}

This command contract is reserved for the MVP runtime.

Supported smoke options:
  --help       Show command help
  --dry-run    Validate command routing without side effects`);
}

const args = process.argv.slice(2);
const [first] = args;

if (!first || first === "--help" || first === "-h" || first === "help") {
  printMainHelp();
  process.exit(0);
}

if (first === "--version" || first === "-v") {
  console.log(packageJson.version);
  process.exit(0);
}

if (!commands.includes(first)) {
  console.error(`Unknown command: ${first}`);
  console.error("Run apolo --help for usage.");
  process.exit(2);
}

if (args.includes("--help") || args.includes("-h")) {
  printCommandHelp(first);
  process.exit(0);
}

if (args.includes("--dry-run")) {
  console.log(JSON.stringify({
    command: first,
    dryRun: true,
    approval: "always",
    maxAgents: 5,
    status: "contract-ok"
  }));
  process.exit(0);
}

console.error(`apolo ${first} requires the MVP runtime implementation. Try --dry-run or --help.`);
process.exit(64);
