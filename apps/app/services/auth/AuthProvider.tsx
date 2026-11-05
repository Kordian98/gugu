import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  type AuthSession,
  type Locale,
  type MagicLinkVerifyInput,
  type Me,
  type MeResponse,
} from "@gugu/contracts";

import { ApiError, apiFetch } from "./api";
import { AUTH_CLIENT } from "./config";
import { tokenStore } from "./token-store";

type Status = "loading" | "signedIn" | "signedOut";

interface AuthContextValue {
  status: Status;
  user: Me | null;
  /** Emails a magic link (always "sent", even for unknown emails). */
  requestMagicLink(email: string, locale: Locale, redirectPath?: string): Promise<void>;
  /** Exchanges a link token or email + code for a session. Returns where to go next. */
  verify(input: { token: string } | { email: string; code: string }): Promise<AuthSession>;
  reload(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The current session, or null when signed out (401). Other failures also read as signed out. */
async function loadMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch<MeResponse>("/me");
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) console.warn("auth: /me failed", e);
    return null;
  }
}

/** Session state for the whole app (spec 05 §3.2). The API enforces access; this is UX only. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<Me | null>(null);

  const apply = useCallback((me: MeResponse | null) => {
    tokenStore.setCsrf(me?.csrfToken ?? null);
    setUser(me?.user ?? null);
    setStatus(me ? "signedIn" : "signedOut");
  }, []);

  const reload = useCallback(() => loadMe().then(apply), [apply]);

  useEffect(() => {
    void loadMe().then(apply);
  }, [apply]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      async requestMagicLink(email, locale, redirectPath) {
        await apiFetch("/auth/magic-link", {
          method: "POST",
          body: { email, locale, client: AUTH_CLIENT, ...(redirectPath ? { redirectPath } : {}) },
        });
      },
      async verify(input) {
        const body: MagicLinkVerifyInput = { ...input, client: AUTH_CLIENT };
        const session = await apiFetch<AuthSession>("/auth/magic-link/verify", {
          method: "POST",
          body,
        });
        if (session.session.kind === "web") tokenStore.setCsrf(session.session.csrfToken);
        else await tokenStore.setTokens(session.session.tokens);
        setUser(session.user);
        setStatus("signedIn");
        return session;
      },
      reload,
      async signOut() {
        try {
          await apiFetch("/auth/sign-out", { method: "POST" });
        } catch (e) {
          // An expired session is already signed out. Other failures must allow a retry:
          // dropping local state would leave a valid httpOnly cookie on shared devices.
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
        }
        await tokenStore.clear();
        await queryClient.cancelQueries();
        queryClient.clear();
        setUser(null);
        setStatus("signedOut");
      },
    }),
    [status, user, reload, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
