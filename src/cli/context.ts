import type { Env } from "../fs/layout.js";
import type { OutputFormat } from "../core/results.js";
import type { Logger, Writer } from "./logger.js";

export interface CliContext {
  readonly cwd: string;
  readonly env: Env;
  readonly isInteractive: boolean;
  readonly outputFormat: OutputFormat;
  readonly signal: AbortSignal | undefined;
  readonly logger: Logger;
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly readLine: (prompt: string) => Promise<string>;
}
