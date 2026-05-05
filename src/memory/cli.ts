import { ApoloError } from "../cli/errors.js";
import type { CliContext } from "../cli/context.js";
import { loadConfig } from "../config/loader.js";
import { createMemoryStore, resolveMemoryFile, type MemoryNamespace, type MemoryRecordType } from "./store.js";

interface MemoryOptions {
  readonly namespace: MemoryNamespace;
  readonly text: string | undefined;
  readonly id: string | undefined;
  readonly title: string | undefined;
  readonly body: string | undefined;
  readonly type: MemoryRecordType;
  readonly tags: readonly string[];
  readonly format: "markdown" | "json";
  readonly limit: number;
}

export async function runMemoryCommand(args: readonly string[], context: CliContext): Promise<number> {
  const [subcommand, ...subcommandArgs] = args;
  if (!subcommand) {
    return printMemorySummary(context);
  }

  const options = parseMemoryOptions(subcommandArgs);
  const store = await resolveStore(context, options.namespace);
  if (subcommand === "list") {
    const records = await store.list({ namespace: options.namespace, limit: options.limit });
    writeRecords(context, records);
    return 0;
  }
  if (subcommand === "search") {
    const text = options.text ?? firstPositional(subcommandArgs);
    if (!text) {
      throw usageError("apolo memory search requires a query.");
    }
    const records = await store.search({ namespace: options.namespace, text, tags: options.tags, limit: options.limit });
    writeRecords(context, records);
    return 0;
  }
  if (subcommand === "show") {
    const id = options.id ?? firstPositional(subcommandArgs);
    if (!id) {
      throw usageError("apolo memory show requires an id.");
    }
    const record = await store.get(id);
    if (!record) {
      throw new ApoloError(`Memory record not found: ${id}`, { exitCode: 1 });
    }
    context.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    return 0;
  }
  if (subcommand === "add") {
    if (!options.title || !options.body) {
      throw usageError("apolo memory add requires --title and --body.");
    }
    const record = await store.add({
      namespace: options.namespace,
      recordType: options.type,
      title: options.title,
      body: options.body,
      tags: options.tags
    });
    context.stdout.write(`Added memory ${record.id}\n`);
    return 0;
  }
  if (subcommand === "export") {
    context.stdout.write(await store.export({ namespace: options.namespace, limit: options.limit }, options.format));
    context.stdout.write("\n");
    return 0;
  }

  throw usageError(`Unknown memory subcommand: ${subcommand}`);
}

async function printMemorySummary(context: CliContext): Promise<number> {
  const config = await loadConfig(context.cwd, context.env);
  context.stdout.write("APOLO memory\n");
  context.stdout.write("driver: jsonl\n");
  context.stdout.write(`global: ${resolveMemoryFile(config.manifest.memory.globalPath)}\n`);
  context.stdout.write(`repo: ${resolveMemoryFile(config.manifest.memory.repoPath)}\n`);
  context.stdout.write("commands: list, search, show, add, export\n");
  return 0;
}

async function resolveStore(context: CliContext, namespace: MemoryNamespace) {
  const config = await loadConfig(context.cwd, context.env);
  const path = namespace === "global" ? config.manifest.memory.globalPath : config.manifest.memory.repoPath;
  return createMemoryStore(resolveMemoryFile(path), namespace);
}

function parseMemoryOptions(args: readonly string[]): MemoryOptions {
  const values = new Map<string, string>();
  const tags: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const value = rawValue ?? args[index + 1];
    if (!rawKey || value === undefined || value.startsWith("--")) {
      throw usageError(`Missing value for --${rawKey}.`);
    }
    if (!rawValue) {
      index += 1;
    }
    if (rawKey === "tag") {
      tags.push(value);
    } else {
      values.set(rawKey, value);
    }
  }

  return {
    namespace: parseNamespace(values.get("namespace")),
    text: values.get("query") ?? values.get("text"),
    id: values.get("id"),
    title: values.get("title"),
    body: values.get("body"),
    type: parseRecordType(values.get("type")),
    tags,
    format: parseFormat(values.get("format")),
    limit: parseLimit(values.get("limit"))
  };
}

function writeRecords(context: CliContext, records: readonly { id: string; recordType: string; title: string; tags: readonly string[] }[]): void {
  for (const record of records) {
    const tags = record.tags.length > 0 ? ` [${record.tags.join(",")}]` : "";
    context.stdout.write(`${record.id}\t${record.recordType}\t${record.title}${tags}\n`);
  }
}

function firstPositional(args: readonly string[]): string | undefined {
  return args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
}

function parseNamespace(value: string | undefined): MemoryNamespace {
  if (value === undefined || value === "repo") {
    return "repo";
  }
  if (value === "global") {
    return "global";
  }
  throw usageError("Memory namespace must be repo or global.");
}

function parseRecordType(value: string | undefined): MemoryRecordType {
  if (value === undefined) {
    return "observation";
  }
  if (value === "decision" || value === "summary" || value === "observation" || value === "run_event" || value === "task") {
    return value;
  }
  throw usageError("Memory type must be decision, summary, observation, run_event, or task.");
}

function parseFormat(value: string | undefined): "markdown" | "json" {
  if (value === undefined || value === "markdown") {
    return "markdown";
  }
  if (value === "json") {
    return "json";
  }
  throw usageError("Memory export format must be markdown or json.");
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) {
    return 20;
  }
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw usageError("Memory limit must be an integer between 1 and 1000.");
  }
  return limit;
}

function usageError(message: string): ApoloError {
  return new ApoloError(message, {
    exitCode: 2,
    hint: "Run `apolo memory --help` for usage."
  });
}
