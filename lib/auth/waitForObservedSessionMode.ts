export const SESSION_MODE_NOT_VISIBLE = 'SESSION_MODE_NOT_VISIBLE';

export type ObservedSessionMode = 'customer' | 'business';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_INTERVAL_MS = 16;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Resolves only after a React-observed session mode matches the server mode.
 * Convex applies the query transition before the mutation promise continues,
 * but the screen gates read the mode from the next render.
 */
export async function waitForObservedSessionMode(
  readMode: () => string | null | undefined,
  expectedMode: ObservedSessionMode,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? defaultSleep;
  const started = now();

  while (readMode() !== expectedMode) {
    if (now() - started >= timeoutMs) {
      throw new Error(SESSION_MODE_NOT_VISIBLE);
    }
    await sleep(intervalMs);
  }
}
