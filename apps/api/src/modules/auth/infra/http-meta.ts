import type { Request, Response } from "express";
import { ipPrefix } from "./tokens";

export interface RequestMeta {
  ipPrefix: string | null;
  userAgent: string | null;
}

export const requestMeta = (req: Request): RequestMeta => ({
  ipPrefix: ipPrefix(req.ip ?? req.socket.remoteAddress),
  userAgent: req.headers["user-agent"]?.slice(0, 256) ?? null,
});

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // malformed cookie value: ignore
    }
  }
  return out;
}

/** Web session cookie (spec 05 R9). `__Host-` + Secure in production; plain name on http://localhost. */
export const sessionCookieName = (production: boolean): string =>
  production ? "__Host-gugu_session" : "gugu_session";

export const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, production: boolean, secret: string): void {
  res.cookie(sessionCookieName(production), secret, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: WEB_SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, production: boolean): void {
  res.clearCookie(sessionCookieName(production), {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
  });
}

export const CSRF_HEADER = "x-csrf-token";
