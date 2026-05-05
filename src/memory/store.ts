import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { redactText } from "../security/redaction.js";

export type MemoryNamespace = "global" | "repo";
export type MemoryRecordType = "decision" | "summary" | "observation" | "run_event" | "task";
export type MemoryExportFormat = "markdown" | "json";

export interface MemoryRecord {
  readonly id: string;
  readonly namespace: MemoryNamespace;
  readonly recordType: MemoryRecordType;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly source?: string;
  readonly sensitivity: "redacted";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface NewMemoryRecord {
  readonly namespace?: MemoryNamespace;
  readonly recordType?: MemoryRecordType;
  readonly title: string;
  readonly body: string;
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface MemoryQuery {
  readonly namespace?: MemoryNamespace;
  readonly text?: string;
  readonly recordTypes?: readonly MemoryRecordType[];
  readonly tags?: readonly string[];
  readonly limit?: number;
}

export interface MemoryStore {
  readonly driver: string;
  add(record: NewMemoryRecord): Promise<MemoryRecord>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(query?: MemoryQuery): Promise<readonly MemoryRecord[]>;
  search(query: MemoryQuery): Promise<readonly MemoryRecord[]>;
  export(query?: MemoryQuery, format?: MemoryExportFormat): Promise<string>;
}

export class JsonlMemoryStore implements MemoryStore {
  readonly driver = "jsonl";

  constructor(
    private readonly filePath: string,
    private readonly namespace: MemoryNamespace
  ) {}

  async add(record: NewMemoryRecord): Promise<MemoryRecord> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const now = new Date().toISOString();
    const redactedTitle = redactMemoryText(record.title);
    const redactedBody = redactMemoryText(record.body);
    const redactedSource = redactMemoryText(record.source ?? "");
    const tags = (record.tags ?? []).map((tag) => redactMemoryText(tag).text);
    const redactionCount = redactedTitle.findings.length + redactedBody.findings.length + redactedSource.findings.length;
    const saved: MemoryRecord = {
      id: randomUUID(),
      namespace: record.namespace ?? this.namespace,
      recordType: record.recordType ?? "observation",
      title: redactedTitle.text,
      body: redactedBody.text,
      tags,
      ...(redactedSource.text ? { source: redactedSource.text } : {}),
      sensitivity: "redacted",
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...record.metadata,
        redactionCount
      }
    };

    const records = await this.readRecords();
    records.unshift(saved);
    await this.writeRecords(records);
    return saved;
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return (await this.readRecords()).find((record) => record.id === id);
  }

  async list(query: MemoryQuery = {}): Promise<readonly MemoryRecord[]> {
    return this.filterRecords(await this.readRecords(), query);
  }

  async search(query: MemoryQuery): Promise<readonly MemoryRecord[]> {
    return this.list(query);
  }

  async export(query: MemoryQuery = {}, format: MemoryExportFormat = "markdown"): Promise<string> {
    const records = await this.list({ limit: 1000, ...query });
    if (format === "json") {
      return JSON.stringify(records, null, 2);
    }
    return renderMarkdownExport(records);
  }

  private async readRecords(): Promise<MemoryRecord[]> {
    if (!(await exists(this.filePath))) {
      return [];
    }
    const content = await readFile(this.filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MemoryRecord);
  }

  private async writeRecords(records: readonly MemoryRecord[]): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private filterRecords(records: readonly MemoryRecord[], query: MemoryQuery): readonly MemoryRecord[] {
    const namespace = query.namespace ?? this.namespace;
    const text = query.text?.trim().toLowerCase();
    const recordTypes = new Set(query.recordTypes ?? []);
    const tags = query.tags ?? [];
    return records
      .filter((record) => record.namespace === namespace)
      .filter((record) => recordTypes.size === 0 || recordTypes.has(record.recordType))
      .filter((record) => tags.every((tag) => record.tags.includes(tag)))
      .filter((record) => !text || `${record.title}\n${record.body}`.toLowerCase().includes(text))
      .slice(0, query.limit ?? 20);
  }
}

export function createMemoryStore(filePath: string, namespace: MemoryNamespace): MemoryStore {
  return new JsonlMemoryStore(filePath, namespace);
}

export function renderMarkdownExport(records: readonly MemoryRecord[]): string {
  const lines = [
    "# APOLO Memory Export",
    "",
    "For future Claude: this note is sanitized memory. Use it as project context, not as a source of secrets or credentials.",
    ""
  ];
  for (const record of records) {
    lines.push(
      `## ${redactMemoryText(record.title).text}`,
      "",
      `- Type: \`${record.recordType}\``,
      `- Namespace: \`${record.namespace}\``,
      `- Created: \`${record.createdAt}\``,
      "",
      redactMemoryText(record.body).text.trim() || "_No details recorded._",
      ""
    );
  }
  return lines.join("\n");
}

function redactMemoryText(text: string) {
  return redactText(text, { allowDummyPlaceholders: false });
}

export function resolveMemoryFile(repoMemoryPath: string): string {
  if (repoMemoryPath.endsWith(".sqlite") || repoMemoryPath.endsWith(".jsonl")) {
    return repoMemoryPath.replace(/\.(?:sqlite|jsonl)$/, ".jsonl");
  }
  return join(repoMemoryPath, "memory.jsonl");
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
