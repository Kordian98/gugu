// Shared fixtures: `seed` = this project's seeded salon (from global-setup), `api` = absolute API
// base, and per-role signed-in pages in their own browser contexts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test as base, type Page } from "@playwright/test";
import { signInViaUi } from "./auth";
import { WEB } from "./env";
import type { SeededSalon } from "./seed";

const SEED_FILE = resolve(import.meta.dirname, "../.e2e/seed.json");

export function seedFor(project: string): SeededSalon {
  const all = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Record<string, SeededSalon>;
  const s = all[project];
  if (!s) throw new Error(`no seed for project ${project} in ${SEED_FILE}`);
  return s;
}

export function otherSeed(project: string): SeededSalon {
  const all = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Record<string, SeededSalon>;
  const other = Object.values(all).find((s) => s.project !== project);
  if (!other) throw new Error("need two seeded salons for cross-tenant checks");
  return other;
}

export interface SignedInOptions {
  locale?: "vi" | "en";
  next?: string;
  /** Phone-sized context (390×844, touch) for staff "my day" and the mobile smoke. */
  mobile?: boolean;
}

type Fixtures = {
  seed: SeededSalon;
  /** Opens a fresh context signed in as `email` (vi unless given). */
  signedIn: (email: string, opts?: SignedInOptions) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use, info) => {
    await use(seedFor(info.project.name));
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
