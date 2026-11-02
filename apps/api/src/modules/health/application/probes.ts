import type { HealthCheck } from "@gugu/contracts";

/** A dependency check used by the readiness report. Implementations must never throw. */
export interface Probe {
  check(): Promise<HealthCheck>;
}

export const DATABASE_PROBE = Symbol("DATABASE_PROBE");
export const REDIS_PROBE = Symbol("REDIS_PROBE");

const TIMEOUT_MS = 2_000;

/** Runs `fn` with a timeout and maps the outcome to a HealthCheck without leaking error details. */
export async function timedCheck(fn: () => Promise<unknown>): Promise<HealthCheck> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, TIMEOUT_MS);
      }),
    ]);
    return { status: "up", latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    const error = e instanceof Error && e.message === "timeout" ? "timeout" : "unreachable";
    return { status: "down", latencyMs: Math.round(performance.now() - started), error };
  } finally {
    clearTimeout(timer);
  }
}
