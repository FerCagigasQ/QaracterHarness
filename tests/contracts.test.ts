import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITY_SCHEMA,
  APOLO_COMMAND_NAMES,
  COMMAND_CONTRACTS,
  EXIT_CODES,
  MEMORY_RECORD_SCHEMA,
  PLAN_ARTIFACT_SCHEMA,
  PRODUCT_RUNTIME_CONTRACT,
  RUN_LEDGER_SCHEMA,
  SECURITY_EVENT_SCHEMA,
  STABLE_SCHEMAS,
  type FieldSchema,
  type StableSchema
} from "../src/contracts/schemas.js";

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, "test", "fixtures", "contracts");

describe("APOLO product contracts", () => {
  it("keeps the 1.0 runtime contract TypeScript/Node-only", () => {
    expect(PRODUCT_RUNTIME_CONTRACT.mandatoryRuntime).toBe("node");
    expect(PRODUCT_RUNTIME_CONTRACT.implementationLanguage).toBe("typescript");
    expect(PRODUCT_RUNTIME_CONTRACT.packageManager).toBe("npm");
    expect(PRODUCT_RUNTIME_CONTRACT.optionalLegacyRuntimes).toEqual(["python"]);
  });

  it("defines exactly the seven CLI command contracts", () => {
    expect(COMMAND_CONTRACTS.map((contract) => contract.name)).toEqual(APOLO_COMMAND_NAMES);
    expect(COMMAND_CONTRACTS).toHaveLength(7);
    expect(new Set(COMMAND_CONTRACTS.map((contract) => contract.name)).size).toBe(7);
    expect(COMMAND_CONTRACTS.every((contract) => contract.outputs.length > 0)).toBe(true);
  });

  it("keeps public exit code meanings stable", () => {
    expect(EXIT_CODES).toEqual({
      success: 0,
      runtimeFailure: 1,
      invalidUsage: 2,
      unavailable: 64,
      environmentFailure: 70,
      invalidConfig: 78,
      interrupted: 130
    });
  });

  it("validates all stable schema fixtures", async () => {
    await expectFixture("plan-artifact.json", PLAN_ARTIFACT_SCHEMA);
    await expectJsonlFixture("run-ledger.jsonl", RUN_LEDGER_SCHEMA);
    await expectFixture("memory-record.json", MEMORY_RECORD_SCHEMA);
    await expectFixture("security-event.json", SECURITY_EVENT_SCHEMA);
    await expectFixture("agent-capability.json", AGENT_CAPABILITY_SCHEMA);
  });

  it("requires strict top-level schema fields", () => {
    for (const schema of STABLE_SCHEMAS) {
      expect(schema.schemaVersion).toBe(1);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.requiredFields).toContain("schemaVersion");
      expect(schema.requiredFields).toContain("kind");
      const kindSchema = schema.properties.kind;
      expect(kindSchema).toBeDefined();
      expect(kindSchema?.enum).toEqual([schema.kind]);
    }
  });
});

async function expectFixture(fileName: string, schema: StableSchema): Promise<void> {
  const payload = JSON.parse(await readFile(join(fixtureRoot, fileName), "utf8")) as Record<string, unknown>;
  expectPayloadMatchesSchema(payload, schema);
}

async function expectJsonlFixture(fileName: string, schema: StableSchema): Promise<void> {
  const lines = (await readFile(join(fixtureRoot, fileName), "utf8"))
    .split("\n")
    .filter((line) => line.trim().length > 0);

  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const payload = JSON.parse(line) as Record<string, unknown>;
    expectPayloadMatchesSchema(payload, schema);
  }
}

function expectPayloadMatchesSchema(payload: Record<string, unknown>, schema: StableSchema): void {
  expect(payload.schemaVersion).toBe(schema.schemaVersion);
  expect(payload.kind).toBe(schema.kind);

  for (const field of schema.requiredFields) {
    expect(payload).toHaveProperty(field);
  }

  if (!schema.additionalProperties) {
    expect(Object.keys(payload).sort()).toEqual([...schema.requiredFields].sort());
  }

  for (const [field, fieldSchema] of Object.entries(schema.properties)) {
    expectField(payload[field], fieldSchema);
  }
}

function expectField(value: unknown, schema: FieldSchema): void {
  const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

  if (allowedTypes.includes("integer")) {
    expect(typeof value).toBe("number");
    expect(Number.isInteger(value)).toBe(true);
  } else {
    expect(allowedTypes).toContain(actualType);
  }

  if (schema.enum) {
    expect(typeof value).toBe("string");
    expect(schema.enum).toContain(value as string);
  }

  if (schema.items && Array.isArray(value)) {
    for (const item of value) {
      expectField(item, schema.items);
    }
  }
}
