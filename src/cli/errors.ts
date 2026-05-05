export interface ApoloErrorOptions {
  readonly exitCode?: number;
  readonly hint?: string;
}

export class ApoloError extends Error {
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(message: string, options: ApoloErrorOptions = {}) {
    super(message);
    this.name = "ApoloError";
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
  }
}
