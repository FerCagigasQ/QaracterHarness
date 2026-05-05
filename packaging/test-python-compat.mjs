import { spawnSync } from "node:child_process";

if (process.env.APOLO_RUN_LEGACY_PYTHON_TESTS !== "1") {
  console.log("Skipping legacy Python harness tests. Set APOLO_RUN_LEGACY_PYTHON_TESTS=1 to run them.");
  process.exit(0);
}

const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, ["-m", "unittest", "discover", "-s", "test/harness", "-p", "test_*.py"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.log(`Skipping legacy Python harness tests: ${result.error.message}`);
  process.exit(0);
}

process.exit(result.status ?? 1);
