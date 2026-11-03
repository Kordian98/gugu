#!/usr/bin/env node
/**
 * Screenshots of the payroll & commission UX (topic 07, owner review 2026-11-03) at 1440 and 390
 * in vi, against a running preview seeded with apps/api/scripts/seed-payroll-demo.mjs. Usage:
 *   node scripts/e2e/crm-payroll-ux.mjs http://localhost:8131 --phase before|after \
 *     --owner <email> --staff <email>
 * Writes docs/qa/07-payroll-ux/<phase>-<viewport>-<screen>.webp. Screens that do not exist in a
 * phase (e.g. the services commission card before the redesign) are skipped, never faked.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = process.argv[2] ?? "http://localhost:8131";
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const phase = arg("phase") ?? "after";
const mailpit = arg("mailpit") ?? "http://localhost:18025/api/v1";
const out = join(root, "docs/qa/07-payroll-ux");
mkdirSync(out, { recursive: true });
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"));
}

const states = new Map();
// Phone shots use a tall 390-wide viewport so the whole screen is captured (RN scroll views).
const viewport = (mobile) => (mobile ? { width: 390, height: 1600 } : { width: 1440, height: 960 });
/** One magic link per user per run (rate limit); the session is reused for the other viewport. */
async function signIn(browser, email, mobile, dark = false) {
  const opts = {
    viewport: viewport(mobile),
    deviceScaleFactor: 1,
    colorScheme: dark ? "dark" : "light",
  };
  if (states.has(email)) return browser.newContext({ ...opts, storageState: states.get(email) });
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const since = Date.now();
  await p.goto(`${base}/vi/sign-in`, { waitUntil: "load" });
  await p.waitForSelector("input", { timeout: 90_000 });
  await p.waitForLoadState("networkidle").catch(() => undefined);
  await p.waitForTimeout(1500); // hydration resets an early fill
  await p.fill("input", email);
  await p.getByRole("button", { name: /link/i }).first().click();
  let link = null;
  for (let i = 0; i < 40 && !link; i++) {
    await p.waitForTimeout(700);
    const q = await (await fetch(`${mailpit}/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = q.messages?.find((x) => Date.parse(x.Created) >= since - 5000);
    if (m) {
      const msg = await (await fetch(`${mailpit}/message/${m.ID}`)).json();
      link = (msg.Text.match(/https?:\/\/\S+verify\S*/) ?? [null])[0];
    }
  }
  if (!link) throw new Error(`magic link not found for ${email}`);
  await p.goto(link.replace(/^https?:\/\/[^/]+/, base), { waitUntil: "load" });
  await p.waitForURL(/business/, { timeout: 60_000 }).catch(() => undefined);
  await p.close();
  states.set(email, await ctx.storageState());
  return ctx;
}

const shot = async (page, vp, name) => {
  await page.waitForTimeout(900);
  const png = join(out, `${phase}-${vp}-${name}.png`);
  await page.screenshot({ path: png, fullPage: true });
  try {
    execFileSync("cwebp", ["-quiet", "-q", "80", png, "-o", png.replace(/\.png$/, ".webp")]);
    rmSync(png);
  } catch {
    /* keep png */
  }
  console.log(`shot ${phase}-${vp}-${name}`);
};
const has = (page, sel, timeout = 25_000) =>
  page.waitForSelector(sel, { timeout }).then(
    () => true,
    () => false,
  );
const tid = (id) => `[data-testid="${id}"]`;
const tidPrefix = (id) => `[data-testid^="${id}"]`;

const browser = await pw.chromium.launch({ channel: "chrome" }).catch(() => pw.chromium.launch());

for (const [vp, mobile] of [
  ["1440", false],
  ["390", true],
]) {
  const owner = await signIn(browser, arg("owner"), mobile);
  const page = await owner.newPage();

  await page.goto(`${base}/vi/business`, { waitUntil: "load" });
  await has(page, tid("crm-today-profit"));
  await shot(page, vp, "today");

  await page.goto(`${base}/vi/business/team`, { waitUntil: "load" });
  await has(page, tidPrefix("crm-staff-pay-"));
  await shot(page, vp, "team");
  await page.locator(tidPrefix("crm-staff-pay-")).first().click();
  if (await has(page, tid("crm-pay-save"))) await shot(page, vp, "pay-sheet");

  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  await has(page, tid("crm-payroll-table"));
  await shot(page, vp, "payroll-current");
  await page.locator(tidPrefix("crm-payroll-row-")).first().click();
  if (await has(page, tid("crm-payroll-sum"))) await shot(page, vp, "payroll-person");
  await page.keyboard.press("Escape");
  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  await has(page, tid("crm-payroll-table"));
  await page.click(tid("crm-payroll-month-prev"));
  await has(page, tid("crm-payroll-reopen"));
  await shot(page, vp, "payroll-closed");
  if (await has(page, tid("crm-payroll-tab-rates"), 3000)) {
    await page.click(tid("crm-payroll-tab-rates"));
    await has(page, tid("crm-rates-table"));
    await shot(page, vp, "payroll-rates");
  }

  await page.goto(`${base}/vi/business/insights?tab=month`, { waitUntil: "load" });
  await has(page, tid("crm-profit-breakdown"));
  await shot(page, vp, "profit");

  await page.goto(`${base}/vi/business/services`, { waitUntil: "load" });
  await has(page, '[data-testid^="crm-service-0"]');
  await page.locator('[data-testid^="crm-service-0"] [role="button"]').first().click();
  if (await has(page, tid("crm-service-save"))) {
    if (await has(page, tid("crm-service-commission"), 8000)) {
      await page.locator(tid("crm-service-commission")).scrollIntoViewIfNeeded();
    }
    await shot(page, vp, "service-editor");
  }
  await owner.close();

  if (arg("staff")) {
    const staff = await signIn(browser, arg("staff"), mobile);
    const sp = await staff.newPage();
    await sp.goto(`${base}/vi/business`, { waitUntil: "load" });
    await has(sp, tid("crm-my-earnings"));
    await shot(sp, vp, "staff-my-earnings");
    await staff.close();
  }
}

// Dark mode (business workspace only, X18): payroll + This month at 1440.
{
  const dark = await signIn(browser, arg("owner"), false, true);
  const page = await dark.newPage();
  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  await has(page, tid("crm-payroll-table"));
  await shot(page, "1440", "dark-payroll");
  await page.goto(`${base}/vi/business/insights?tab=month`, { waitUntil: "load" });
  await has(page, tid("crm-profit-breakdown"));
  await shot(page, "1440", "dark-profit");
  await dark.close();
}

await browser.close();
console.log("STATUS: ok");
