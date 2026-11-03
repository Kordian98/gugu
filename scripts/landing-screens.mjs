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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
/** Comma list of shot names to (re)take; default all. */
const only = arg("only", "").split(",").filter(Boolean);
/**
 * Crops are taken at 3× device pixels so they stay sharp on retina desktops (2×) and phones (3×) without
 * ever being upscaled (≤ 1.15× rule); the landing serves them with srcset (`-2x` + full size; not `@2x`, which Metro treats as a scale variant).
 */
const CROP_DPR = 3;
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
 * in CSS px of the 1440×900 viewport, captured at CROP_DPR and also written as a 2/3-size `-2x` file for
 * srcset) or nothing (full screen, resized to 2400 px wide). `tab` clicks a tab label first.
 */
const SHOTS = (t) => [
  { name: "overview", route: "business" },
  { name: "timeline", route: "business", card: t.timeline.title },
  { name: "upcoming", route: "business", card: t.upcoming.title },
  { name: "kpis", route: "business", card: t.kpi.revenueToday, row: t.kpi.occupancy },
  { name: "calendar", route: "business/calendar" },
  { name: "calendar-crop", route: "business/calendar", region: [276, 66, 860, 340] },
  { name: "appointments", route: "business/appointments" },
  { name: "appointments-crop", route: "business/appointments", region: [295, 102, 1098, 324] },
  // Full services screen is not used by the landing (it carries the AI-import banner): skip the check.
  { name: "services", route: "business/services", unused: true },
  { name: "services-crop", route: "business/services", region: [278, 208, 912, 310] },
  { name: "insights", route: "business/insights" },
  { name: "insights-month", route: "business/insights", tab: t.profit.tabs.month },
  { name: "payroll", route: "business/payroll" },
  { name: "insights-kpis", route: "business/insights", region: [736, 204, 677, 324] },
  { name: "payroll-table", route: "business/payroll", region: [276, 220, 944, 366] },
  { name: "zalo", route: "business/zalo" },
];

function run(cmd, args, cwd = root) {
  console.log("$", cmd, args.join(" "));
  execFileSync(cmd, args, { stdio: "inherit", cwd });
}

/**
 * Magic-link sign-in through Mailpit; returns a logged-in browser context. The session is cached in the
 * OS temp dir per email (magic links are rate-limited), so re-runs reuse it.
 */
const statePath = join(tmpdir(), `gugu-landing-screens-${email.replace(/\W/g, "_")}.json`);
async function signIn(browser) {
  const opts = {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  };
  if (existsSync(statePath)) {
    const cached = await browser.newContext({ ...opts, storageState: statePath });
    const probe = await cached.newPage();
    await probe.goto(`${web}/vi/business`, { waitUntil: "load" });
    await probe.waitForTimeout(3000);
    const ok = !probe.url().includes("sign-in");
    await probe.close();
    if (ok) return cached;
    await cached.close();
  }
  const ctx = await browser.newContext(opts);
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
  await ctx.storageState({ path: statePath });
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

// The seed reads ../../.env relative to its cwd (apps/api): DATABASE_URL must be YOUR database.
if (seed)
  run(
    "node",
    ["scripts/seed-payroll-demo.mjs", "--api", api, "--email", email],
    join(root, "apps/api"),
  );
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
  const crops = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: CROP_DPR,
    colorScheme: "light",
    storageState: await ctx.storageState(),
  });
  const cropPage = await crops.newPage();
  for (const s0 of SHOTS(t)) {
    if (only.length && !only.includes(s0.name)) continue;
    const s = s0;
    const pg = s.region ? cropPage : page;
    await pg.goto(`${web}/${loc}/${s.route}`, { waitUntil: "load" });
    await pg.waitForTimeout(3500);
    await pg.addStyleTag({ content: "#error-overlay,#error-toast{display:none!important}" });
    if (s.tab) {
      await pg.getByText(s.tab, { exact: true }).filter({ visible: true }).first().click();
      await pg.waitForTimeout(2000);
    }
    // The landing must show a salon that is already set up: the checklist title may not be on a used
    // full screen, nor inside a crop rectangle.
    const setupBox = await pg
      .getByText(t.setup.title, { exact: true })
      .first()
      .boundingBox()
      .catch(() => null);
    const inRegion =
      setupBox &&
      s.region &&
      setupBox.x < s.region[0] + s.region[2] &&
      setupBox.x + setupBox.width > s.region[0] &&
      setupBox.y < s.region[1] + s.region[3] &&
      setupBox.y + setupBox.height > s.region[1];
    if (setupBox && !s.unused && (!s.region || inRegion))
      throw new Error(`${loc} ${s.name}: the setup checklist is on screen`);
    let clip;
    if (s.card) {
      const a = await cardOf(pg, s.card);
      if (!a) throw new Error(`label not found: ${loc} ${s.name} "${s.card}"`);
      clip = a;
      if (s.row) {
        const b = await cardOf(pg, s.row);
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
      clip = { x, y, width: w, height: h };
    }
    const png = join(dir, `${s.name}.png`);
    const buf = await pg.screenshot({ path: png, ...(clip ? { clip } : {}) });
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const scale = clip ? 1 : 2400 / w;
    if (s.region) {
      // srcset companion at 2× (2/3 of the 3× pixels) for retina desktops and smaller downloads.
      execFileSync("cwebp", [
        "-quiet",
        "-q",
        "84",
        "-resize",
        String(Math.round((w * 2) / 3)),
        "0",
        png,
        "-o",
        png.replace(/\.png$/, "-2x.webp"),
      ]);
    }
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
  await crops.close();
}
await browser.close();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote", manifestPath);
