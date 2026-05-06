import { ApoloError } from "../cli/errors.js";
import type { CliContext } from "../cli/context.js";
import { resolveApoloPaths } from "../fs/layout.js";
import { createPlannerAdapter } from "./adapter.js";
import { createPlanArtifact, renderPlanMarkdown } from "./artifact.js";
import { buildContextPack } from "./context.js";
import type { PlanOptions } from "./types.js";

export async function runPlan(args: readonly string[], context: CliContext): Promise<number> {
  const options = parsePlanArgs(args);
  const paths = resolveApoloPaths(context.cwd, context.env);
  const contextPack = await buildContextPack(context.cwd, context.env);
  const artifact = await createPlanArtifact({
    cwd: context.cwd,
    plansDir: paths.plansDir,
    options,
    contextPack,
    planner: createPlannerAdapter(context.env)
  });

  if (options.format === "json") {
    context.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return 0;
  }

  if (options.dryRun) {
    context.stdout.write(renderPlanMarkdown(artifact));
    return 0;
  }

  context.stdout.write(`Plan artifact written: ${artifact.artifactPath}\n`);
  context.stdout.write("Review and approve this plan before running `apolo run`.\n");
  return 0;
}

function parsePlanArgs(args: readonly string[]): PlanOptions {
  let task: string | undefined;
  let dryRun = false;
  let format: PlanOptions["format"] = "text";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--task") {
      task = readFlagValue(args, index, "--task");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--task=")) {
      task = arg.slice("--task=".length);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--format") {
      format = parseFormat(readFlagValue(args, index, "--format"));
      index += 1;
      continue;
    }

    if (arg?.startsWith("--format=")) {
      format = parseFormat(arg.slice("--format=".length));
      continue;
    }

    throw new ApoloError(`Unexpected apolo plan argument: ${arg ?? ""}`, {
      exitCode: 2,
      hint: "Use `apolo plan --task \"...\" [--dry-run] [--format json]`."
    });
  }

  if (!task?.trim()) {
    throw new ApoloError("apolo plan requires --task.", {
      exitCode: 2,
      hint: "Example: `apolo plan --task \"Add tests for the parser\"`."
    });
  }

  return { task: task.trim(), dryRun, format };
}

function readFlagValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new ApoloError(`${flag} requires a value.`, {
      exitCode: 2,
      hint: "Use `apolo plan --task \"...\" [--dry-run] [--format json]`."
    });
  }

  return value;
}

function parseFormat(value: string): PlanOptions["format"] {
  if (value === "text" || value === "json") {
    return value;
  }

  throw new ApoloError(`Unsupported plan output format: ${value}`, {
    exitCode: 2,
    hint: "Supported formats: text, json."
  });
}
