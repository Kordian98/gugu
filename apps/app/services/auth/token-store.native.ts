import * as SecureStore from "expo-secure-store";

import type { NativeTokens } from "@gugu/contracts";

/** Native: tokens live only in the platform keychain/keystore (spec 05 R10/R11 — never AsyncStorage). */
const KEY = "gugu.auth.tokens";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const tokenStore = {
  async getTokens(): Promise<NativeTokens | null> {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as NativeTokens;
    } catch {
      return null;
    }
  },
  setTokens: (tokens: NativeTokens): Promise<void> =>
    SecureStore.setItemAsync(KEY, JSON.stringify(tokens), OPTIONS),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(KEY, OPTIONS),
  getCsrf: (): string | null => null,
  setCsrf: (_value: string | null): void => undefined,
};
