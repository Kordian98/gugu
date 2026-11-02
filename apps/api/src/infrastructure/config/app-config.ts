import type { Env } from "./env";

/** Typed, validated configuration. Inject this class; don't read process.env elsewhere. */
export class AppConfig {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === "production";
  }
}
