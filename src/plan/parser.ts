import type { ApprovalStatus, PlanRecord, RiskLevel, TaskClassification } from "./types.js";

const frontMatterPattern = /^---\n([\s\S]*?)\n---\n/;

const validApprovalStatus = (value: string): ApprovalStatus => {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }
  throw new Error(`Invalid approval status: ${value}`);
};

const validClassification = (value: string): TaskClassification => {
  const allowed: TaskClassification[] = [
    "bugfix",
    "feature",
    "refactor",
    "test",
    "documentation",
    "analysis",
    "unknown",
  ];
  if (allowed.includes(value as TaskClassification)) {
    return value as TaskClassification;
  }
  throw new Error(`Invalid classification: ${value}`);
};

const validRisk = (value: string): RiskLevel => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  throw new Error(`Invalid risk: ${value}`);
};

const parseFrontMatter = (markdown: string): Record<string, string> => {
  const match = markdown.match(frontMatterPattern);
  const body = match?.[1];
  if (!body) {
    throw new Error("Plan markdown is missing front matter");
  }

  return Object.fromEntries(
    body
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) {
          throw new Error(`Invalid front matter line: ${line}`);
        }
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
};

const extractSection = (markdown: string, heading: string): string => {
  const pattern = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |\\s*$)`, "m");
  const match = markdown.match(pattern);
  return match?.[1]?.trim() ?? "";
};

const parseList = (section: string): string[] =>
  section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((item) => item !== "None detected");

export const parsePlanMarkdown = (markdown: string): Pick<
  PlanRecord,
  "id" | "createdAt" | "approvalStatus" | "classification" | "cost" | "task" | "uncertainties" | "likelyFiles"
> => {
  const frontMatter = parseFrontMatter(markdown);
  const id = frontMatter.id;
  const createdAt = frontMatter.createdAt;
  if (!id || !createdAt) {
    throw new Error("Plan front matter must include id and createdAt");
  }

  return {
    id,
    createdAt,
    approvalStatus: validApprovalStatus(frontMatter.approvalStatus ?? ""),
    classification: validClassification(frontMatter.classification ?? ""),
    cost: {
      risk: validRisk(frontMatter.risk ?? ""),
      agents: Number.parseInt(frontMatter.agents ?? "0", 10),
      expectedMinutes: Number.parseInt(frontMatter.expectedMinutes ?? "0", 10),
    },
    task: extractSection(markdown, "Task"),
    uncertainties: parseList(extractSection(markdown, "Uncertainties")),
    likelyFiles: parseList(extractSection(markdown, "Likely Files")),
  };
};
