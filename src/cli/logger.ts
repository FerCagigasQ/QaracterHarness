export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Writer {
  write(chunk: string): void;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const severity: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export function createLogger(writer: Writer, level: LogLevel = "info"): Logger {
  const shouldWrite = (messageLevel: Exclude<LogLevel, "silent">): boolean =>
    severity[messageLevel] >= severity[level];

  const write = (messageLevel: Exclude<LogLevel, "silent">, message: string): void => {
    if (shouldWrite(messageLevel)) {
      writer.write(`[apolo] ${messageLevel}: ${message}\n`);
    }
  };

  return {
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message)
  };
}

export function logLevelFromArgs(args: readonly string[]): LogLevel {
  if (args.includes("--quiet")) {
    return "silent";
  }

  if (args.includes("--verbose")) {
    return "debug";
  }

  return "info";
}
