import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { CommandRunner, VerificationCommandDetector, type DetectedCommand, type VerificationDetector } from "../src/verification/commands.js";

describe("typescript verification commands", () => {
  it("detects Node/npm, Python target repo checks, Make targets, and fallback", async () => {
    const nodeRepo = await mkdtemp(join(tmpdir(), "apolo-node-"));
    await writeFile(join(nodeRepo, "package.json"), JSON.stringify({
      scripts: {
        test: "vitest",
        build: "vite build",
        lint: "eslint .",
        typecheck: "tsc --noEmit"
      }
    }), "utf8");
    await expect(new VerificationCommandDetector().detect(nodeRepo)).resolves.toEqual([
      { name: "npm-lint", command: ["npm", "run", "lint"] },
      { name: "npm-typecheck", command: ["npm", "run", "typecheck"] },
      { name: "npm-build", command: ["npm", "run", "build"] },
      { name: "npm-test", command: ["npm", "run", "test"] }
    ]);

    const pythonRepo = await mkdtemp(join(tmpdir(), "apolo-python-"));
    await mkdir(join(pythonRepo, "tests"));
    await writeFile(join(pythonRepo, "requirements.txt"), "pytest==8.0.0\nruff==0.5.0\n", "utf8");
    await expect(new VerificationCommandDetector().detect(pythonRepo)).resolves.toEqual([
      { name: "python-ruff", command: ["python", "-m", "ruff", "check", "."] },
      { name: "python-pytest", command: ["python", "-m", "pytest"] }
    ]);

    const makeRepo = await mkdtemp(join(tmpdir(), "apolo-make-"));
    await writeFile(join(makeRepo, "Makefile"), "lint:\n\t@echo lint\n\ntest:\n\t@echo test\n", "utf8");
    await expect(new VerificationCommandDetector().detect(makeRepo)).resolves.toEqual([
      { name: "make-lint", command: ["make", "lint"] },
      { name: "make-test", command: ["make", "test"] }
    ]);

    const emptyRepo = await mkdtemp(join(tmpdir(), "apolo-empty-"));
    await expect(new VerificationCommandDetector().detect(emptyRepo)).resolves.toEqual([
      { name: "safe-fallback", command: ["node", "-e", "console.log('No verification commands detected')"] }
    ]);
  });

  it("returns structured redacted timeout results and continues remaining commands", async () => {
    const repo = await mkdtemp(join(tmpdir(), "apolo-runner-"));
    const detector: VerificationDetector = {
      detect: async (): Promise<readonly DetectedCommand[]> => [
        { name: "slow", command: [process.execPath, "-e", "setTimeout(() => {}, 1000)"] },
        { name: "fast", command: [process.execPath, "-e", "console.error('password=DUMMY_SECRET_VALUE_123456'); console.log('ok')"] }
      ]
    };

    const results = await new CommandRunner(detector, 50).run(repo);

    expect(results).toHaveLength(2);
    expect(results[0]?.timedOut).toBe(true);
    expect(results[0]?.passed).toBe(false);
    expect(results[1]?.passed).toBe(true);
    expect(results[1]?.stdout).toContain("ok");
    expect(results[1]?.stderr).toContain("[REDACTED_SECRET]");
    expect(results[1]?.stderr).not.toContain("DUMMY_SECRET_VALUE_123456");
  });
});
