import { createPublicKey, verify as verifySignature, type webcrypto } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { SocialProvider } from "@gugu/contracts";

/** Verified claims we rely on. */
export interface VerifiedIdToken {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

interface ProviderSpec {
  jwksUrl: string;
  issuers: readonly string[];
}

const PROVIDERS: Record<SocialProvider, ProviderSpec> = {
  google: {
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
  },
  apple: { jwksUrl: "https://appleid.apple.com/auth/keys", issuers: ["https://appleid.apple.com"] },
};

const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;

type Jwk = webcrypto.JsonWebKey & { kid?: string };

/**
 * Verifies Google / Apple OpenID Connect ID tokens with node:crypto against the providers' JWKS
 * (RS256 / ES256). Checks signature, issuer, audience (our client IDs), expiry.
 */
@Injectable()
export class IdTokenVerifier {
  private readonly cache = new Map<SocialProvider, { at: number; keys: Jwk[] }>();

  async verify(
    provider: SocialProvider,
    idToken: string,
    audiences: readonly string[],
  ): Promise<VerifiedIdToken | null> {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as typeof header;
      payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as typeof payload;
    } catch {
      return null;
    }
    if (header.alg !== "RS256" && header.alg !== "ES256") return null;
    const key = (await this.keys(provider)).find((k) => k.kid === header.kid);
    if (!key) return null;
    const ok = verifySignature(
      header.alg === "RS256" ? "RSA-SHA256" : "SHA256",
      Buffer.from(`${h}.${p}`),
      header.alg === "ES256"
        ? { key: createPublicKey({ key, format: "jwk" }), dsaEncoding: "ieee-p1363" }
        : createPublicKey({ key, format: "jwk" }),
      Buffer.from(s, "base64url"),
    );
    if (!ok) return null;
    return checkClaims(payload, PROVIDERS[provider].issuers, audiences);
  }

  private async keys(provider: SocialProvider): Promise<Jwk[]> {
    const cached = this.cache.get(provider);
    if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
    const res = await fetch(PROVIDERS[provider].jwksUrl, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return cached?.keys ?? [];
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = body.keys ?? [];
    this.cache.set(provider, { at: Date.now(), keys });
    return keys;
  }
}

/** Pure claim checks (exported for tests). */
export function checkClaims(
  payload: Record<string, unknown>,
  issuers: readonly string[],
  audiences: readonly string[],
  nowS = Math.floor(Date.now() / 1000),
): VerifiedIdToken | null {
  const aud = payload["aud"];
  const audOk = Array.isArray(aud)
    ? aud.some((a) => typeof a === "string" && audiences.includes(a))
    : typeof aud === "string" && audiences.includes(aud);
  const exp = payload["exp"];
  const sub = payload["sub"];
  if (
    !audOk ||
    typeof payload["iss"] !== "string" ||
    !issuers.includes(payload["iss"]) ||
    typeof exp !== "number" ||
    exp + CLOCK_SKEW_S < nowS ||
    typeof sub !== "string" ||
    sub.length === 0
  ) {
    return null;
  }
  const email = typeof payload["email"] === "string" ? payload["email"].toLowerCase() : null;
  const verified = payload["email_verified"];
  return { subject: sub, email, emailVerified: verified === true || verified === "true" };
}
