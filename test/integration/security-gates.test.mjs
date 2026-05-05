import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("security gates", () => {
  it("passes the Python security gate test suite", () => {
    const result = spawnSync(
      "python",
      ["-m", "unittest", "discover", "-s", "tests/security"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          PYTHONPATH: repoRoot,
        },
        encoding: "utf8",
      },
    );

    assert.equal(
      result.status,
      0,
      `${result.stdout}\n${result.stderr}`,
    );
  });
});
