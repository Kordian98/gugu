#!/usr/bin/env node
/**
 * One-command retake of every REAL GuGu Studio screen the landing uses (dev only, your own DB):
 *
 *   node scripts/landing-screens.mjs --web http://localhost:8097 --api http://localhost:3017 \
 *     [--mailpit http://localhost:18025] [--email owner-landing@demo.gugu] [--no-seed]
 *
 * Preconditions: an API on YOUR OWN database (never a shared one) whose WEB_ORIGINS includes --web, an
 * Expo web dev server for this branch at --web, Mailpit for magic links, Playwright + cwebp installed.
 *
 * Steps:
 * 1. Seed: apps/api/scripts/seed-payroll-demo.mjs (runs seed-demo-salon.mjs first: "Lotus Nail & Spa
 *    Quận 1", 4 staff, services, bookings; then last/this month history, pay settings, payroll).
 * 2. Sign in as the owner (magic link via Mailpit) and FINISH SETUP: press "go live" on the Today screen
 *    (`crm-go-live`), so the onboarding checklist ("Thiết lập bằng AI…") is gone. Every capture asserts
 *    the checklist title is not on the page — the landing shows a salon that is already set up.
 * 3. Capture vi + en at 1440×900 @2x: full screens and card / region crops (SHOTS below), write
 *    apps/app/assets/studio/<locale>/<name>.webp and merge the pixel sizes into manifest.json.
 *
 * After a retake, review the crops (callout positions in flow.css.ts assume the current crops) and
 * update docs/qa/02-landing-flow.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") throw new Error("landing-screens is dev-only");
const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const web = arg("web", "http://localhost:8097");
const api = arg("api", "http://localhost:3017");
const mailpit = `${arg("mailpit", "http://localhost:18025")}/api/v1`;
const email = arg("email", `owner-landing-${Date.now()}@demo.gugu`);
const seed = !process.argv.includes("--no-seed");
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"));
}
const crm = (loc) =>
  JSON.parse(readFileSync(join(root, `packages/localization/locales/${loc}/crm.json`), "utf8"));

/**
 * Each shot: route, then either `card` (crop to the card holding that label), `region` (crop rectangle
 * as fractions of the viewport) or nothing (full screen, resized to 2400 px wide). `tab` clicks a tab
 * label first (e.g. Insights → "Tháng này").
 */
const SHOTS = (t) => [
  { name: "overview", route: "business" },
  { name: "timeline", route: "business", card: t.timeline.title },
  { name: "upcoming", route: "business", card: t.upcoming.title },
  { name: "kpis", route: "business", card: t.kpi.revenueToday, row: t.kpi.occupancy },
  { name: "calendar", route: "business/calendar" },
  { name: "calendar-crop", route: "business/calendar", region: [0.2, 0.06, 0.64, 0.44] },
  { name: "appointments", route: "business/appointments" },
  { name: "appointments-crop", route: "business/appointments", region: [0.2, 0.17, 0.82, 0.24] },
  { name: "services", route: "business/services" },
  { name: "services-crop", route: "business/services", region: [0.2, 0.2, 0.65, 0.26] },
  { name: "insights", route: "business/insights" },
  { name: "insights-month", route: "business/insights", tab: t.profit.tabs.month },
  { name: "payroll", route: "business/payroll" },
  { name: "zalo", route: "business/zalo" },
];

function run(cmd, args) {
  console.log("$", cmd, args.join(" "));
  execFileSync(cmd, args, { stdio: "inherit", cwd: root });
}

/** Magic-link sign-in through Mailpit; returns a logged-in browser context. */
async function signIn(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const p = await ctx.newPage();
  const since = Date.now();
  await p.goto(`${web}/vi/sign-in`, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.fill("input", email);
  await p.keyboard.press("Enter");
  let link = null;
  for (let i = 0; i < 30 && !link; i++) {
    await p.waitForTimeout(1000);
    const q = await (await fetch(`${mailpit}/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = q.messages?.find((x) => Date.parse(x.Created) >= since - 5000);
    if (m) {
      const msg = await (await fetch(`${mailpit}/message/${m.ID}`)).json();
      link = (msg.Text.match(/https?:\/\/\S+verify\S*/) ?? [null])[0];
    }
  }
  if (!link) throw new Error("magic link not found in Mailpit");
  await p.goto(link.replace(/^https?:\/\/[^/]+/, web), { waitUntil: "load" });
  await p.waitForTimeout(5000);
  await p.close();
  return ctx;
}

/** Finish onboarding so the setup checklist disappears for good. */
async function finishSetup(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${web}/vi/business`, { waitUntil: "load" });
  await p.waitForTimeout(4000);
  const live = p.getByTestId("crm-go-live");
  if (await live.count()) {
    await live.click();
    await p.waitForTimeout(3000);
  }
  await p.close();
}

const cardOf = (page, text, minH = 140) =>
  page.evaluate(
    ({ text, minH }) => {
      const el = [...document.querySelectorAll("div,span")].find(
        (n) =>
          n.childElementCount === 0 && n.textContent?.trim().toLowerCase() === text.toLowerCase(),
      );
      if (!el) return null;
      let n = el;
      while (n && n.getBoundingClientRect().height < minH) n = n.parentElement;
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { text, minH },
  );

if (seed) run("node", ["apps/api/scripts/seed-payroll-demo.mjs", "--api", api, "--email", email]);
const manifestPath = join(root, "apps/app/assets/studio/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const browser = await pw.chromium.launch({ channel: "chrome" }).catch(() => pw.chromium.launch());
const ctx = await signIn(browser);
await finishSetup(ctx);
for (const loc of ["vi", "en"]) {
  const t = crm(loc);
  const dir = join(root, "apps/app/assets/studio", loc);
  mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  for (const s of SHOTS(t)) {
    await page.goto(`${web}/${loc}/${s.route}`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    await page.addStyleTag({ content: "#error-overlay,#error-toast{display:none!important}" });
    if (s.tab) {
      await page.getByText(s.tab, { exact: true }).first().click();
      await page.waitForTimeout(2000);
    }
    // The landing must show a salon that is already set up.
    if (await page.getByText(t.setup.title, { exact: true }).count())
      throw new Error(`${loc} ${s.name}: the setup checklist is still on screen`);
    let clip;
    if (s.card) {
      const a = await cardOf(page, s.card);
      if (!a) throw new Error(`label not found: ${loc} ${s.name} "${s.card}"`);
      clip = a;
      if (s.row) {
        const b = await cardOf(page, s.row);
        if (b)
          clip = {
            x: a.x,
            y: Math.min(a.y, b.y),
            width: b.x + b.width - a.x,
            height: Math.max(a.height, b.height),
          };
      }
      clip = { x: clip.x - 8, y: clip.y - 8, width: clip.width + 16, height: clip.height + 16 };
    } else if (s.region) {
      const [x, y, w, h] = s.region;
      clip = { x: x * 1440, y: y * 900, width: w * 1440, height: h * 900 };
    }
    const png = join(dir, `${s.name}.png`);
    const buf = await page.screenshot({ path: png, ...(clip ? { clip } : {}) });
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const scale = clip ? 1 : 2400 / w;
    (manifest[loc] ??= {})[s.name] = { w: Math.round(w * scale), h: Math.round(h * scale) };
    execFileSync("cwebp", [
      "-quiet",
      "-q",
      "82",
      "-resize",
      clip ? "0" : "2400",
      "0",
      png,
      "-o",
      png.replace(/\.png$/, ".webp"),
    ]);
    rmSync(png);
    console.log("captured", loc, s.name);
  }
  await page.close();
}
await browser.close();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote", manifestPath);
