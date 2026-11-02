import type { Env } from "./env";

/** Typed, validated configuration. Inject this class; don't read process.env elsewhere. */
export class AppConfig {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === "production";
  }

  get webOrigins(): string[] {
    return splitList(this.env.WEB_ORIGINS);
  }

  get googleClientIds(): string[] {
    return splitList(this.env.GOOGLE_CLIENT_IDS);
  }

  get appleClientIds(): string[] {
    return splitList(this.env.APPLE_CLIENT_IDS);
  }
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
