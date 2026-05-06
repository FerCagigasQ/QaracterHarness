import { ApoloError } from "./errors.js";

export interface TimeoutSignal {
  readonly signal: AbortSignal;
  cancel(): void;
}

export function createTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromParent = (): void => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message = "Operation timed out."
): Promise<T> {
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    return await operation(timeout.signal);
  } catch (error) {
    if (timeout.signal.aborted) {
      throw new ApoloError(message, {
        code: "TIMEOUT",
        exitCode: 70
      });
    }

    throw error;
  } finally {
    timeout.cancel();
  }
}
