import type { NativeTokens } from "@gugu/contracts";

/**
 * Web: no token storage at all — the session is an httpOnly cookie (spec 05 R11: never
 * localStorage). Only the CSRF token is kept, in memory; it is re-fetched from /me after a reload.
 */
let csrf: string | null = null;

export const tokenStore = {
  getTokens: (): Promise<NativeTokens | null> => Promise.resolve(null),
  setTokens: (_tokens: NativeTokens): Promise<void> => Promise.resolve(),
  clear: (): Promise<void> => {
    csrf = null;
    return Promise.resolve();
  },
  getCsrf: (): string | null => csrf,
  setCsrf: (value: string | null): void => {
    csrf = value;
  },
};
