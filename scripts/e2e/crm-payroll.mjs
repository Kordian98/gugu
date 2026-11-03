#!/usr/bin/env node
/**
 * Playwright check of the payroll / profit flows (topic 07, ADR-0014) against a running preview
 * seeded with apps/api/scripts/seed-payroll-demo.mjs. Usage:
 *   node scripts/e2e/crm-payroll.mjs http://localhost:8117 --owner <email> --staff <email> --manager <email> [--api http://localhost:3017]
 * Signs in by magic link (Mailpit), asserts the main paths in vi and en, light and dark, desktop
 * and mobile, and writes screenshots to docs/qa/07-payroll/. Exits non-zero on the first failure.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const base = process.argv[2] ?? "http://localhost:8117";
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const mailpit = "http://localhost:18025/api/v1";
const out = join(root, "docs/qa/07-payroll");
mkdirSync(out, { recursive: true });
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"));
}
const crm = (loc) =>
  JSON.parse(readFileSync(join(root, `packages/localization/locales/${loc}/crm.json`), "utf8"));
const VI = crm("vi");
const EN = crm("en");

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

async function signIn(browser, email, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    colorScheme: opts.dark ? "dark" : "light",
  });
  const p = await ctx.newPage();
  const since = Date.now();
  await p.goto(`${base}/vi/sign-in`, { waitUntil: "load" });
  await p.waitForSelector("input", { timeout: 60_000 });
  await p.waitForLoadState("networkidle").catch(() => undefined);
  await p.waitForTimeout(1500); // hydration resets an early fill
  await p.fill("input", email);
  await p.getByRole("button", { name: /link/i }).first().click();
  let link = null;
  for (let i = 0; i < 30 && !link; i++) {
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
  await p.waitForURL(/business/, { timeout: 30_000 }).catch(() => undefined);
  await p.close();
  return ctx;
}

const shot = async (page, name) => {
  const png = join(out, `${name}.png`);
  await page.screenshot({ path: png, fullPage: true });
  try {
    execFileSync("cwebp", ["-quiet", "-q", "80", png, "-o", png.replace(/\.png$/, ".webp")]);
    rmSync(png);
  } catch {
    /* keep png */
  }
};
const visible = (page, id, timeout = 20_000) =>
  page.waitForSelector(`[data-testid="${id}"]`, { timeout }).then(
    () => true,
    () => false,
  );
const text = (page, id) => page.locator(`[data-testid="${id}"]`).first().innerText();

const browser = await pw.chromium.launch({ channel: "chrome" }).catch(() => pw.chromium.launch());

// ── Owner, desktop, vi + en ─────────────────────────────────────────────────────────────────
const owner = await signIn(browser, arg("owner"));
for (const [loc, T] of [
  ["vi", VI],
  ["en", EN],
]) {
  const page = await owner.newPage();
  await page.goto(`${base}/${loc}/business/payroll`, { waitUntil: "load" });
  check(await visible(page, "crm-payroll-table"), `${loc} payroll table renders`);
  check(await visible(page, "crm-payroll-note"), `${loc} "estimate before tax and insurance" note`);
  check(
    (await text(page, "crm-payroll-note")).includes(T.payroll.estimateNote.slice(0, 20)),
    `${loc} note is localized`,
  );
  check(await visible(page, "crm-payroll-close"), `${loc} one primary action: close month`);
  await shot(page, `owner-desktop-${loc}-payroll-current`);
  // Last month: closed, read-only, paid marks.
  await page.click('[data-testid="crm-payroll-month-prev"]');
  check(await visible(page, "crm-payroll-reopen"), `${loc} last month is closed (reopen offered)`);
  await shot(page, `owner-desktop-${loc}-payroll-closed`);
  await page.locator('[data-testid^="crm-payroll-row-"]').first().click();
  check(await visible(page, "crm-payroll-sum"), `${loc} person sheet: base + commission = to pay`);
  await page.waitForTimeout(800);
  await shot(page, `owner-desktop-${loc}-payroll-person-closed`);
  await page.keyboard.press("Escape");
  await page.close();

  const ins = await owner.newPage();
  await ins.goto(`${base}/${loc}/business/insights?tab=month`, { waitUntil: "load" });
  check(await visible(ins, "crm-profit-tiles"), `${loc} profit view: 4 headline tiles`);
  check(
    (await ins.locator('[data-testid^="crm-profit-tile-"]').count()) === 4,
    `${loc} exactly 4 headline tiles`,
  );
  check(await visible(ins, "crm-profit-breakdown"), `${loc} actual vs projected breakdown`);
  check(await visible(ins, "crm-profit-costs"), `${loc} other monthly costs listed`);
  await shot(ins, `owner-desktop-${loc}-profit`);
  await ins.close();
}

// Tile values = registry metric values from the API (registry/tile consistency, UI side).
{
  const page = await owner.newPage();
  await page.goto(`${base}/vi/business/insights?tab=month`, { waitUntil: "load" });
  await visible(page, "crm-profit-value-profit.net");
  const tile = await text(page, "crm-profit-value-profit.net");
  const row = await text(page, "crm-profit-net");
  check(row.includes(tile.trim()), "net profit tile equals the breakdown's net line");
  // Today: compact "This month" card for the owner.
  await page.goto(`${base}/vi/business`, { waitUntil: "load" });
  check(await visible(page, "crm-today-profit"), "Today shows the owner's This-month card");
  check(
    (await text(page, "crm-today-profit-net")).trim() === tile.trim(),
    "Today card net = Insights tile",
  );
  await shot(page, "owner-desktop-vi-today-profit");
  // Team → Pay & commission per member.
  await page.goto(`${base}/vi/business/team`, { waitUntil: "load" });
  await page.waitForSelector('[data-testid^="crm-staff-pay-"]', { timeout: 20_000 });
  await page.locator('[data-testid^="crm-staff-pay-"]').first().click();
  check(await visible(page, "crm-pay-save"), "Team → Pay opens the pay & commission sheet");
  await page.waitForTimeout(800);
  await shot(page, "owner-desktop-vi-pay-sheet");
  await page.close();
}

// Add an adjustment with a reason on the open month (vi).
{
  const page = await owner.newPage();
  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  await visible(page, "crm-payroll-table");
  await page.locator('[data-testid^="crm-payroll-row-"]').nth(1).click();
  await visible(page, "crm-adjust-add");
  await page.click('[data-testid="crm-adjust-add"]');
  check(
    await page.getByText(VI.common.required).first().isVisible(),
    "adjustment without amount/reason is refused",
  );
  await page.fill('[data-testid="crm-adjust-amount"]', "300000");
  await page.fill('[data-testid="crm-adjust-reason"]', "Thưởng doanh số tuần");
  await page.click('[data-testid="crm-adjust-add"]');
  check(
    await page
      .getByText("Thưởng doanh số tuần")
      .first()
      .waitFor({ timeout: 10_000 })
      .then(
        () => true,
        () => false,
      ),
    "adjustment with a reason is added",
  );
  await shot(page, "owner-desktop-vi-payroll-adjustment");
  // Remove it again (audited) so repeated runs leave the demo data unchanged.
  await page.getByRole("button", { name: VI.payroll.adjustments.remove }).last().click();
  check(
    await page
      .getByText("Thưởng doanh số tuần")
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .then(
        () => true,
        () => false,
      ),
    "adjustment can be removed",
  );
  await page.close();
}
await owner.close();

// Dark mode (panel only).
{
  const dark = await signIn(browser, arg("owner"), { dark: true });
  const page = await dark.newPage();
  await page.goto(`${base}/en/business/payroll`, { waitUntil: "load" });
  check(await visible(page, "crm-payroll-table"), "dark: payroll renders");
  await shot(page, "owner-desktop-en-dark-payroll");
  await page.goto(`${base}/en/business/insights?tab=month`, { waitUntil: "load" });
  await visible(page, "crm-profit-tiles");
  await shot(page, "owner-desktop-en-dark-profit");
  await dark.close();
}

// ── Staff (Mai), mobile: own earnings only; payroll forbidden; no nav entry ─────────────────
{
  const staff = await signIn(browser, arg("staff"), { mobile: true });
  const page = await staff.newPage();
  await page.goto(`${base}/vi/business`, { waitUntil: "load" });
  check(await visible(page, "crm-my-earnings"), "staff my day shows own earnings estimate");
  check(
    (await text(page, "crm-my-earnings")).includes(VI.myEarnings.note.slice(0, 12)),
    "own earnings note",
  );
  await shot(page, "staff-mobile-vi-my-earnings");
  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  check(
    await visible(page, "crm-payroll-forbidden"),
    "staff: payroll page shows permission denied",
  );
  await page.goto(`${base}/en/business`, { waitUntil: "load" });
  check(await visible(page, "crm-my-earnings"), "staff en: own earnings estimate");
  await shot(page, "staff-mobile-en-my-earnings");
  await staff.close();
}

// ── Manager (Hà) without the owner's grant: forbidden ──────────────────────────────────────
if (arg("manager")) {
  const mgr = await signIn(browser, arg("manager"));
  const page = await mgr.newPage();
  await page.goto(`${base}/vi/business/payroll`, { waitUntil: "load" });
  check(await visible(page, "crm-payroll-forbidden"), "manager without grant: payroll forbidden");
  await page.goto(`${base}/vi/business/insights`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  check(
    (await page.getByText(VI.profit.tabs.month).count()) === 0,
    "manager without grant: no This-month tab",
  );
  await mgr.close();
}

await browser.close();
console.log(failures === 0 ? "STATUS: ok" : `STATUS: fail ${String(failures)} check(s)`);
process.exit(failures === 0 ? 0 : 1);
