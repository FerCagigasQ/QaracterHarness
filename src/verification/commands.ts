import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { redactText } from "../security/redaction.js";

export interface DetectedCommand {
  readonly name: string;
  readonly command: readonly string[];
}

export interface VerificationResult {
  readonly name: string;
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly passed: boolean;
  readonly timedOut: boolean;
}

export interface VerificationDetector {
  detect(repository: string): Promise<readonly DetectedCommand[]>;
}

export class VerificationCommandDetector {
  async detect(repository: string): Promise<readonly DetectedCommand[]> {
    return [
      ...(await this.detectNode(repository)),
      ...(await this.detectPython(repository)),
      ...(await this.detectMake(repository)),
      ...(await this.detectFallback(repository))
    ];
  }

  private async detectNode(repository: string): Promise<readonly DetectedCommand[]> {
    const packageJsonPath = join(repository, "package.json");
    if (!(await exists(packageJsonPath))) {
      return [];
    }
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};
    const commands: DetectedCommand[] = [];
    for (const script of ["lint", "typecheck", "build", "test"]) {
      if (Object.hasOwn(scripts, script)) {
        commands.push({ name: `npm-${script}`, command: ["npm", "run", script] });
      }
    }
    return commands;
  }

  private async detectPython(repository: string): Promise<readonly DetectedCommand[]> {
    const pyprojectPath = join(repository, "pyproject.toml");
    const requirementsPath = join(repository, "requirements.txt");
    const testsPath = join(repository, "tests");
    const hasPyproject = await exists(pyprojectPath);
    const hasRequirements = await exists(requirementsPath);
    const hasTests = await exists(testsPath);
    if (!hasPyproject && !hasRequirements && !hasTests) {
      return [];
    }

    const pyproject = hasPyproject ? (await readFile(pyprojectPath, "utf8")).toLowerCase() : "";
    const requirements = hasRequirements ? (await readFile(requirementsPath, "utf8")).toLowerCase() : "";
    const text = `${pyproject}\n${requirements}`;
    const commands: DetectedCommand[] = [];
    if (text.includes("ruff")) {
      commands.push({ name: "python-ruff", command: ["python", "-m", "ruff", "check", "."] });
    }
    if (text.includes("mypy")) {
      commands.push({ name: "python-mypy", command: ["python", "-m", "mypy", "."] });
    }
    if (text.includes("pytest")) {
      commands.push({ name: "python-pytest", command: ["python", "-m", "pytest"] });
    } else if (hasTests) {
      commands.push({ name: "python-tests", command: ["python", "-m", "unittest", "discover", "-s", "tests"] });
    }
    return commands;
  }

  private async detectMake(repository: string): Promise<readonly DetectedCommand[]> {
    const makefilePath = join(repository, "Makefile");
    if (!(await exists(makefilePath))) {
      return [];
    }
    const content = await readFile(makefilePath, "utf8");
    const commands: DetectedCommand[] = [];
    for (const target of ["lint", "typecheck", "build", "test"]) {
      if (new RegExp(`^${target}:`, "m").test(content)) {
        commands.push({ name: `make-${target}`, command: ["make", target] });
      }
    }
    return commands;
  }

  private async detectFallback(repository: string): Promise<readonly DetectedCommand[]> {
    const hasKnownStack = await exists(join(repository, "package.json")) || await exists(join(repository, "pyproject.toml")) || await exists(join(repository, "requirements.txt")) || await exists(join(repository, "Makefile")) || await exists(join(repository, "tests"));
    if (hasKnownStack) {
      return [];
    }
    return [{ name: "safe-fallback", command: ["node", "-e", "console.log('No verification commands detected')"] }];
  }
}

export class CommandRunner {
  constructor(
    private readonly detector: VerificationDetector = new VerificationCommandDetector(),
    private readonly timeoutMs = 600_000
  ) {}

  async run(repository: string): Promise<readonly VerificationResult[]> {
    const commands = await this.detector.detect(repository);
    const results: VerificationResult[] = [];
    for (const command of commands) {
      results.push(await this.runCommand(repository, command));
    }
    return results;
  }

  async runCommand(repository: string, command: DetectedCommand): Promise<VerificationResult> {
    const [executable, ...args] = command.command;
    if (!executable) {
      return result(command, -1, "", "Empty verification command.", false);
    }

    return new Promise((resolve) => {
      const child = spawn(executable, args, { cwd: repository, shell: false });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, this.timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve(result(command, -1, stdout, error.message, false));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const exitCode = timedOut ? -1 : code ?? -1;
        const stderrText = timedOut ? `${stderr}\nCommand timed out after ${this.timeoutMs} ms.` : stderr;
        resolve(result(command, exitCode, stdout, stderrText, timedOut));
      });
    });
  }
}

function result(command: DetectedCommand, exitCode: number, stdout: string, stderr: string, timedOut: boolean): VerificationResult {
  return {
    name: command.name,
    command: command.command,
    exitCode,
    stdout: redactText(stdout, { allowDummyPlaceholders: false }).text,
    stderr: redactText(stderr, { allowDummyPlaceholders: false }).text,
    passed: exitCode === 0,
    timedOut
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
