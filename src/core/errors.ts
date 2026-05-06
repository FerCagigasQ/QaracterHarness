export type ApoloErrorCode =
  | "APPROVAL_REQUIRED"
  | "CONFIG_INVALID"
  | "DEPENDENCY_CHECK_FAILED"
  | "INVALID_ARGUMENTS"
  | "NOT_IMPLEMENTED"
  | "RUNTIME_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_COMMAND";

export interface ApoloErrorOptions {
  readonly code?: ApoloErrorCode;
  readonly exitCode?: number;
  readonly hint?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface StructuredApoloError {
  readonly code: ApoloErrorCode;
  readonly message: string;
  readonly hint?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class ApoloError extends Error {
  readonly code: ApoloErrorCode;
  readonly exitCode: number;
  readonly hint: string | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(message: string, options: ApoloErrorOptions = {}) {
    super(message);
    this.name = "ApoloError";
    this.code = options.code ?? "RUNTIME_ERROR";
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
    this.details = options.details;
  }

  toStructuredError(): StructuredApoloError {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.details ? { details: this.details } : {})
    };
  }
}

export function toStructuredError(error: unknown): StructuredApoloError {
  if (error instanceof ApoloError) {
    return error.toStructuredError();
  }

  return {
    code: "RUNTIME_ERROR",
    message: error instanceof Error ? error.message : "Unexpected failure."
  };
}

export function notImplemented(command: string, owner: string): ApoloError {
  return new ApoloError(`apolo ${command} is not implemented in the TypeScript runtime yet.`, {
    code: "NOT_IMPLEMENTED",
    exitCode: 64,
    hint: `${owner} owns the business logic behind this command. The CLI contract and service boundary are ready.`
  });
}
