// Shared fixtures: `seed` = this project's seeded salon (from global-setup), `api` = absolute API
// base, and per-role signed-in pages in their own browser contexts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test as base, type Page } from "@playwright/test";
import { signInViaUi } from "./auth";
import { WEB } from "./env";
import type { Area, SeedManifest, SeededSalon } from "./seed";

const SEED_FILE = process.env["E2E_SEED_FILE"] ?? resolve(import.meta.dirname, "../.e2e/seed.json");

function manifest(): SeedManifest {
  return JSON.parse(readFileSync(SEED_FILE, "utf8")) as SeedManifest;
}

/** This project's seeded salon for `area`. */
export function seedFor(project: string, area: Area): SeededSalon {
  const s = manifest()[project]?.[area];
  if (!s) throw new Error(`no seed for ${project}/${area} in ${SEED_FILE}`);
  return s;
}

/** Super-admin email seeded for this project. */
export function adminEmailFor(project: string): string {
  const e = manifest()[project]?.adminEmail;
  if (!e) throw new Error(`no admin email for ${project} in ${SEED_FILE}`);
  return e;
}

/** Base32 TOTP secret enrolled for this project's admin by global-setup. */
export function adminTotpSecretFor(project: string): string {
  const s = manifest()[project]?.adminTotpSecret;
  if (!s) throw new Error(`no admin TOTP secret for ${project} in ${SEED_FILE}`);
  return s;
}

/** A salon of the other project (a different tenant) for cross-tenant probes. */
export function otherTenant(project: string, area: Area): SeededSalon {
  const other = Object.entries(manifest()).find(([p]) => p !== project)?.[1]?.[area];
  if (!other) throw new Error("need two seeded projects for cross-tenant checks");
  return other;
}

export interface SignedInOptions {
  locale?: "vi" | "en";
  next?: string;
  /** Phone-sized context (390×844, touch) for staff "my day" and the mobile smoke. */
  mobile?: boolean;
}

type Fixtures = {
  /** Spec area whose seeded salon `seed` returns (set with `test.use({ area: "zalo" })`). */
  area: Area;
  seed: SeededSalon;
  /** Opens a fresh context signed in as `email` (vi unless given). */
  signedIn: (email: string, opts?: SignedInOptions) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  area: ["roles", { option: true }],
  seed: async ({ area }, use, info) => {
    await use(seedFor(info.project.name, area));
  },
  signedIn: async ({ browser }, use, info) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (email, opts = {}) => {
      const locale = opts.locale ?? "vi";
      const ctx = await browser.newContext({
        baseURL: WEB,
        locale: locale === "en" ? "en-US" : "vi-VN",
        timezoneId: "Asia/Ho_Chi_Minh",
        ...(opts.mobile
          ? { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 }
          : { viewport: info.project.use.viewport ?? { width: 1440, height: 900 } }),
      });
      contexts.push(ctx);
      const page = await ctx.newPage();
      await signInViaUi(page, email, locale, opts.next);
      return page;
    });
    for (const c of contexts) await c.close();
  },
});

export { expect } from "@playwright/test";

/** Narrows an optional seed value, failing with a clear message when the area lacks it. */
export function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`seed has no ${what} for this area`);
  return value;
}
