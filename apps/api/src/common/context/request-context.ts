import { AsyncLocalStorage } from "node:async_hooks";
import type { Locale } from "@gugu/contracts";

/**
 * Per-request context (docs/tasks/04-backend-database.md §4.2). Actor and tenant are filled in by
 * the auth and membership guards (topic 05); repositories for tenant tables take `salonId` from here.
 */
export interface RequestContextData {
  requestId: string;
  locale: Locale;
  actor: { type: "anonymous" } | { type: "user" | "agent" | "system"; id: string };
  salonId: string | null;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  /** Current context, or undefined outside a request (jobs set their own via `run`). */
  current(): RequestContextData | undefined {
    return storage.getStore();
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
};
