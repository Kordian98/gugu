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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  // KPI row, the "Tháng này" profit card and the team timeline (below the trial banner). Run
  // scripts/landing-demo-busier.mjs first so the demo month is realistically busy (owner, round 4).
  { name: "overview", route: "business", region: [248, 236, 1192, 664] },
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
  // The whole payroll month screen (export open: CSV + Excel, close the month, summary, table, note)…
  {
    name: "payroll-month",
    route: "business/payroll",
    region: [262, 96, 1164, 790],
    clickText: t.payroll.month.export,
  },
  // …and the per-person drawer (first row: pay rule, commission per completed service, projections).
  {
    name: "payroll-person",
    route: "business/payroll",
    region: [920, 0, 520, 760],
    clickAt: [1380, 525],
  },
  { name: "zalo", route: "business/zalo" },
  // Phone crops for the mobile landing (ADR-0014 mobile): the app at a phone / small-tablet viewport
  // (`vp`, CSS px), so the crop is shown at about 1:1 on a phone; never a shrunken desktop screen.
  { name: "m-month", route: "business", vp: [390, 1000], card: t.profit.card.title },
  // x from `region`, y from the top of the first label's card to the bottom of the second's (vi/en wrap)
  {
    name: "m-insights",
    route: "business/insights",
    vp: [390, 900],
    region: [10, 0, 370, 0],
    span: [t.insights.metrics.appointments_count, t.insights.metrics.no_show_rate],
  },
  { name: "m-payroll", route: "business/payroll", vp: [390, 900], region: [10, 220, 370, 598] },
  {
    name: "m-appointments",
    route: "business/appointments",
    vp: [390, 900],
    region: [10, 120, 370, 420],
  },
  { name: "m-calendar", route: "business/calendar", vp: [768, 900], region: [128, 126, 316, 440] },
  { name: "m-services", route: "business/services", vp: [600, 900], region: [10, 296, 404, 300] },
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
  /** One context per phone viewport (`vp` shots), at CROP_DPR. */
  const vpPages = new Map();
  const vpPage = async ([vw, vh]) => {
    const key = `${String(vw)}x${String(vh)}`;
    if (!vpPages.has(key)) {
      const c = await browser.newContext({
        viewport: { width: vw, height: vh },
        deviceScaleFactor: CROP_DPR,
        colorScheme: "light",
        storageState: await ctx.storageState(),
      });
      vpPages.set(key, { c, p: await c.newPage() });
    }
    return vpPages.get(key).p;
  };
  for (const s0 of SHOTS(t)) {
    if (only.length && !only.includes(s0.name)) continue;
    const s = s0;
    const pg = s.vp ? await vpPage(s.vp) : s.region ? cropPage : page;
    // Metro can answer 500 (SSR "Server Error") while it rebuilds: retry a few times.
    for (let attempt = 0; ; attempt++) {
      const resp = await pg.goto(`${web}/${loc}/${s.route}`, { waitUntil: "load" });
      await pg.waitForTimeout(3500);
      const ok = (resp?.status() ?? 200) < 500 && !(await pg.getByText("Server Error").count());
      if (ok) break;
      if (attempt >= 3) throw new Error(`${loc} ${s.name}: dev server keeps failing`);
      await pg.waitForTimeout(5000);
    }
    await pg.addStyleTag({ content: "#error-overlay,#error-toast{display:none!important}" });
    if (s.scrollY) {
      await pg.evaluate((dy) => {
        const sc = [...document.querySelectorAll("div")].filter(
          (d) =>
            /(auto|scroll)/.test(getComputedStyle(d).overflowY) &&
            d.scrollHeight > d.clientHeight + 10,
        );
        sc.sort((a, b) => b.scrollHeight - a.scrollHeight);
        if (sc[0]) sc[0].scrollTop = dy;
      }, s.scrollY);
      await pg.waitForTimeout(800);
    }
    if (s.clickText) {
      await pg.getByText(s.clickText, { exact: true }).filter({ visible: true }).first().click();
      await pg.waitForTimeout(1200);
    }
    if (s.clickAt) {
      await pg.mouse.click(s.clickAt[0], s.clickAt[1]);
      await pg.waitForTimeout(2000);
    }
    if (s.tab) {
      await pg.getByText(s.tab, { exact: true }).filter({ visible: true }).first().click();
      await pg.waitForTimeout(2000);
    }
    // Hide the floating assistant bubble (a fixed overlay in the bottom-right corner, not page content).
    await pg.evaluate(() => {
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "absolute") continue;
        const r = el.getBoundingClientRect();
        if (
          r.width < 90 &&
          r.height < 90 &&
          r.right > innerWidth - 120 &&
          r.bottom > innerHeight - 120
        )
          el.style.visibility = "hidden";
      }
    });
    // Never capture a dev error overlay / LogBox (e.g. while Metro rebuilds): fail instead.
    const broken = await pg.evaluate(() =>
      /Call Stack|Uncaught Error|UnknownModuleError|Render Error|Something went wrong/i.test(
        document.body.innerText,
      ),
    );
    if (broken)
      throw new Error(
        `${loc} ${s.name}: an error overlay is on screen; is the dev server healthy?`,
      );
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
    } else if (s.span) {
      const a = await cardOf(pg, s.span[0], 80);
      const b = await cardOf(pg, s.span[1], 80);
      if (!a || !b) throw new Error(`label not found: ${loc} ${s.name} ${s.span.join(" / ")}`);
      const [x, , w] = s.region;
      clip = { x, y: a.y - 8, width: w, height: b.y + b.height + 8 - (a.y - 8) };
    } else if (s.region) {
      const [x, y, w, h] = s.region;
      clip = { x, y, width: w, height: h };
    }
    // Write into a temp dir and rename into place: a running Metro (e.g. the :8094 preview) watches
    // assets/studio and fails on half-written files ("Image asset … cannot be an empty file").
    const tmp = mkdtempSync(join(tmpdir(), "gugu-shot-"));
    const png = join(tmp, `${s.name}.png`);
    const buf = await pg.screenshot({ path: png, ...(clip ? { clip } : {}) });
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const scale = clip ? 1 : 2400 / w;
    if (s.region || s.vp) {
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
    for (const suffix of [".webp", "-2x.webp"]) {
      const f = png.replace(/\.png$/, suffix);
      if (existsSync(f)) renameSync(f, join(dir, `${s.name}${suffix}`));
    }
    rmSync(tmp, { recursive: true, force: true });
    console.log("captured", loc, s.name);
  }
  await page.close();
  await crops.close();
  for (const { c } of vpPages.values()) await c.close();
}
await browser.close();
writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + "\n");
renameSync(`${manifestPath}.tmp`, manifestPath);
console.log("wrote", manifestPath);
