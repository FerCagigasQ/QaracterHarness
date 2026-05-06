export const PRODUCT_CONTRACT_VERSION = 1;

export const PRODUCT_RUNTIME_CONTRACT = {
  mandatoryRuntime: "node",
  implementationLanguage: "typescript",
  packageManager: "npm",
  minimumNodeVersion: ">=20",
  optionalLegacyRuntimes: ["python"],
  notes: [
    "APOLO-CLI 1.0 installs and runs as an npm package.",
    "Python code in this repository is legacy/reference or test harness code and is not required at product runtime."
  ]
} as const;

export type ApoloCommandName = "init" | "doctor" | "plan" | "run" | "sync" | "memory" | "agents";

export const APOLO_COMMAND_NAMES: readonly ApoloCommandName[] = [
  "init",
  "doctor",
  "plan",
  "run",
  "sync",
  "memory",
  "agents"
];

export const EXIT_CODES = {
  success: 0,
  runtimeFailure: 1,
  invalidUsage: 2,
  unavailable: 64,
  environmentFailure: 70,
  invalidConfig: 78,
  interrupted: 130
} as const;

export type JsonPrimitiveType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface FieldSchema {
  readonly type: JsonPrimitiveType | readonly JsonPrimitiveType[];
  readonly required: boolean;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly items?: FieldSchema;
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly additionalProperties?: boolean;
}

export interface StableSchema {
  readonly schemaVersion: typeof PRODUCT_CONTRACT_VERSION;
  readonly kind: string;
  readonly description: string;
  readonly requiredFields: readonly string[];
  readonly properties: Readonly<Record<string, FieldSchema>>;
  readonly additionalProperties: boolean;
}

export const COMMAND_CONTRACTS: readonly CommandContract[] = [
  {
    name: "init",
    summary: "Create or inspect the local .apolo workspace layout.",
    inputs: {
      args: [],
      options: ["--workspace <path>", "--dry-run", "--format text|json"]
    },
    outputs: ["workspacePath", "createdPaths", "manifestPath", "approvalRequired"],
    sideEffects: ["create .apolo directories", "write manifest when absent"],
    approvalRequiredForSideEffects: true
  },
  {
    name: "doctor",
    summary: "Validate local Node/npm CLI readiness and APOLO configuration.",
    inputs: {
      args: [],
      options: ["--workspace <path>", "--format text|json"]
    },
    outputs: ["runtime", "workspace", "config", "agents", "memory", "diagnostics"],
    sideEffects: [],
    approvalRequiredForSideEffects: false
  },
  {
    name: "plan",
    summary: "Create a read-only plan artifact for a requested task.",
    inputs: {
      args: [],
      options: ["--task <text>", "--output <path>", "--workspace <path>", "--format text|json"]
    },
    outputs: ["planArtifact"],
    sideEffects: ["write plan artifact after approval or dry-run preview"],
    approvalRequiredForSideEffects: true
  },
  {
    name: "run",
    summary: "Execute an approved plan and write a run ledger.",
    inputs: {
      args: [],
      options: ["--plan <path>", "--approve", "--dry-run", "--workspace <path>", "--format text|json"]
    },
    outputs: ["runLedger", "verification", "artifacts", "exitCode"],
    sideEffects: ["agent execution", "file writes", "verification commands", "run ledger writes"],
    approvalRequiredForSideEffects: true
  },
  {
    name: "sync",
    summary: "Synchronize approved local CLI state or metadata.",
    inputs: {
      args: [],
      options: ["--dry-run", "--workspace <path>", "--format text|json"]
    },
    outputs: ["pendingIncoming", "pendingOutgoing", "appliedChanges"],
    sideEffects: ["write local sync state", "push approved metadata when configured"],
    approvalRequiredForSideEffects: true
  },
  {
    name: "memory",
    summary: "Inspect and manage sanitized local memory records.",
    inputs: {
      args: ["list|add|update|prune|export"],
      options: ["--scope global|repository", "--from <path>", "--dry-run", "--format text|json"]
    },
    outputs: ["memoryRecords", "redactionSummary", "changedRecords"],
    sideEffects: ["write, update, prune, or export memory records"],
    approvalRequiredForSideEffects: true
  },
  {
    name: "agents",
    summary: "List and validate local CLI agent capabilities and limits.",
    inputs: {
      args: ["list|inspect"],
      options: ["--format text|json"]
    },
    outputs: ["agentCapabilities", "maxAgents", "diagnostics"],
    sideEffects: [],
    approvalRequiredForSideEffects: false
  }
];

export interface CommandContract {
  readonly name: ApoloCommandName;
  readonly summary: string;
  readonly inputs: {
    readonly args: readonly string[];
    readonly options: readonly string[];
  };
  readonly outputs: readonly string[];
  readonly sideEffects: readonly string[];
  readonly approvalRequiredForSideEffects: boolean;
}

export const PLAN_ARTIFACT_SCHEMA: StableSchema = {
  schemaVersion: PRODUCT_CONTRACT_VERSION,
  kind: "apolo.plan",
  description: "Plan artifact produced by apolo plan and consumed by apolo run.",
  requiredFields: [
    "schemaVersion",
    "kind",
    "id",
    "createdAt",
    "command",
    "runtime",
    "task",
    "status",
    "approvalRequired",
    "maxAgents",
    "agents",
    "steps",
    "verification",
    "security"
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: requiredInteger("Contract version."),
    kind: requiredString("Stable artifact discriminator.", ["apolo.plan"]),
    id: requiredString("Unique plan identifier."),
    createdAt: requiredString("ISO-8601 creation timestamp."),
    command: requiredString("Command that produced the artifact.", ["plan"]),
    runtime: requiredObject("Runtime contract for this artifact."),
    task: requiredString("User task to plan."),
    status: requiredString("Plan lifecycle status.", ["draft", "awaiting_approval", "approved", "rejected"]),
    approvalRequired: requiredBoolean("Whether human approval is required before execution."),
    maxAgents: requiredInteger("Maximum number of agents permitted for the plan."),
    agents: requiredArray("Logical agent ids referenced by the plan.", requiredString("Agent id.")),
    steps: requiredArray("Ordered plan steps.", {
      type: "object",
      required: true,
      description: "Plan step object.",
      additionalProperties: false,
      properties: {
        id: requiredString("Step identifier."),
        title: requiredString("Short step title."),
        agent: requiredString("Logical agent id."),
        action: requiredString("Action to perform."),
        sideEffects: requiredBoolean("Whether the step may create side effects."),
        approvalRequired: requiredBoolean("Whether the step needs approval.")
      }
    }),
    verification: requiredArray("Commands or checks expected after execution.", requiredString("Verification command.")),
    security: requiredObject("Security gates and approval policy.")
  }
};

export const RUN_LEDGER_SCHEMA: StableSchema = {
  schemaVersion: PRODUCT_CONTRACT_VERSION,
  kind: "apolo.run_event",
  description: "Append-only JSONL event emitted by apolo run.",
  requiredFields: [
    "schemaVersion",
    "kind",
    "runId",
    "eventId",
    "sequence",
    "eventType",
    "timestamp",
    "command",
    "severity",
    "payload"
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: requiredInteger("Contract version."),
    kind: requiredString("Stable event discriminator.", ["apolo.run_event"]),
    runId: requiredString("Run identifier shared by all ledger events."),
    eventId: requiredString("Unique event identifier."),
    sequence: requiredInteger("Monotonic event sequence within a run."),
    eventType: requiredString("Run lifecycle event name."),
    timestamp: requiredString("ISO-8601 event timestamp."),
    command: requiredString("Command that emitted the event.", ["run"]),
    severity: requiredString("Event severity.", ["debug", "info", "warning", "error"]),
    payload: requiredObject("Event-specific JSON payload.")
  }
};

export const MEMORY_RECORD_SCHEMA: StableSchema = {
  schemaVersion: PRODUCT_CONTRACT_VERSION,
  kind: "apolo.memory_record",
  description: "Sanitized local memory record managed by apolo memory.",
  requiredFields: [
    "schemaVersion",
    "kind",
    "id",
    "namespace",
    "type",
    "title",
    "body",
    "tags",
    "source",
    "createdAt",
    "updatedAt",
    "sensitivity",
    "retention"
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: requiredInteger("Contract version."),
    kind: requiredString("Stable record discriminator.", ["apolo.memory_record"]),
    id: requiredString("Memory record id."),
    namespace: requiredString("Memory namespace.", ["global", "repository"]),
    type: requiredString("Memory record type.", ["decision", "summary", "observation", "run_event", "task"]),
    title: requiredString("Short memory title."),
    body: requiredString("Sanitized memory body."),
    tags: requiredArray("Searchable tags.", requiredString("Tag.")),
    source: requiredObject("Source metadata."),
    createdAt: requiredString("ISO-8601 creation timestamp."),
    updatedAt: requiredString("ISO-8601 update timestamp."),
    sensitivity: requiredObject("Redaction and sensitivity metadata."),
    retention: requiredObject("Retention policy metadata.")
  }
};

export const SECURITY_EVENT_SCHEMA: StableSchema = {
  schemaVersion: PRODUCT_CONTRACT_VERSION,
  kind: "apolo.security_event",
  description: "Security gate decision emitted before side effects.",
  requiredFields: [
    "schemaVersion",
    "kind",
    "id",
    "createdAt",
    "command",
    "actor",
    "gate",
    "decision",
    "severity",
    "reason",
    "approvalRequired",
    "metadata"
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: requiredInteger("Contract version."),
    kind: requiredString("Stable event discriminator.", ["apolo.security_event"]),
    id: requiredString("Security event id."),
    createdAt: requiredString("ISO-8601 creation timestamp."),
    command: requiredString("Command being evaluated.", APOLO_COMMAND_NAMES),
    actor: requiredString("Actor or agent id being evaluated."),
    gate: requiredString("Security gate name."),
    decision: requiredString("Security decision.", ["allow", "block", "requires_approval"]),
    severity: requiredString("Decision severity.", ["info", "warning", "error"]),
    reason: requiredString("Human-readable decision reason."),
    approvalRequired: requiredBoolean("Whether explicit approval is required."),
    metadata: requiredObject("Decision metadata.")
  }
};

export const AGENT_CAPABILITY_SCHEMA: StableSchema = {
  schemaVersion: PRODUCT_CONTRACT_VERSION,
  kind: "apolo.agent_capability",
  description: "Local CLI agent capability visible through apolo agents.",
  requiredFields: [
    "schemaVersion",
    "kind",
    "id",
    "displayName",
    "provider",
    "adapterType",
    "detection",
    "taskKinds",
    "capabilities",
    "limits"
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: requiredInteger("Contract version."),
    kind: requiredString("Stable capability discriminator.", ["apolo.agent_capability"]),
    id: requiredString("Stable agent id."),
    displayName: requiredString("Human-readable agent name."),
    provider: requiredString("Local provider id."),
    adapterType: requiredString("Adapter type.", ["local-cli", "local-model", "coordinator"]),
    detection: requiredObject("Local executable or service detection state."),
    taskKinds: requiredArray("Task kinds supported by the agent.", requiredString("Task kind.")),
    capabilities: requiredObject("Capability flags."),
    limits: requiredObject("Per-agent limits.")
  }
};

export const STABLE_SCHEMAS = [
  PLAN_ARTIFACT_SCHEMA,
  RUN_LEDGER_SCHEMA,
  MEMORY_RECORD_SCHEMA,
  SECURITY_EVENT_SCHEMA,
  AGENT_CAPABILITY_SCHEMA
] as const;

function requiredString(description: string, enumValues?: readonly string[]): FieldSchema {
  if (enumValues) {
    return {
      type: "string",
      required: true,
      description,
      enum: enumValues
    };
  }

  return {
    type: "string",
    required: true,
    description
  };
}

function requiredInteger(description: string): FieldSchema {
  return {
    type: "integer",
    required: true,
    description
  };
}

function requiredBoolean(description: string): FieldSchema {
  return {
    type: "boolean",
    required: true,
    description
  };
}

function requiredObject(description: string): FieldSchema {
  return {
    type: "object",
    required: true,
    description,
    additionalProperties: true
  };
}

function requiredArray(description: string, items: FieldSchema): FieldSchema {
  return {
    type: "array",
    required: true,
    description,
    items
  };
}
