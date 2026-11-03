#!/usr/bin/env node
/**
 * Captures REAL GuGu Studio CRM screens (business workspace) for the marketing landing.
 * Re-run whenever the CRM changes. Preferred: a real session on a seeded demo salon:
 *
 *   node apps/api/scripts/seed-demo-salon.mjs --email lan@lotus-spa.vn   # topic 07 seed (dev only)
 *   node scripts/capture-studio-screens.mjs http://localhost:8097 --email lan@lotus-spa.vn
 *
 * The web origin must be in the API's WEB_ORIGINS. Without --email it falls back to ?demo=1 (Today only).
 *
 * Needs Playwright (+ Chrome) available: `npx playwright install chromium` or a global install.
 * Output: apps/app/assets/studio/<locale>/<shot>.webp (cwebp) — falls back to .png if cwebp is missing.
 * Also writes apps/app/assets/studio/manifest.json (pixel sizes). The landing imports both via
 * features/landing/screens.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:8094";
const ei = process.argv.indexOf("--email");
const email = ei > 0 ? process.argv[ei + 1] : null;
const mailpit = "http://localhost:18025/api/v1";
let pw;
try {
  pw = require("playwright");
} catch {
  pw = require(join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"));
}

const crm = (loc) =>
  JSON.parse(readFileSync(join(root, `packages/localization/locales/${loc}/crm.json`), "utf8"));

/** Each shot: route + a label inside the card to crop (null = full viewport). */
const shots = (t) => [
  { name: "overview", route: "business", label: null },
  { name: "timeline", route: "business", label: t.timeline.title },
  { name: "upcoming", route: "business", label: t.upcoming.title },
  { name: "kpis", route: "business", label: t.kpi.revenueToday, row: t.kpi.occupancy },
  { name: "ai-setup", route: "business/services", label: t.setup.title, minH: 60 },
  ...(email
    ? [
        { name: "calendar", route: "business/calendar", label: null },
        { name: "appointments", route: "business/appointments", label: null },
        { name: "services", route: "business/services", label: null },
        { name: "team", route: "business/team", label: null },
      ]
    : []),
];

/** Magic-link sign-in through Mailpit (dev only); returns a logged-in browser context. */
async function signIn(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  if (!email) return ctx;
  const p = await ctx.newPage();
  const since = Date.now();
  await p.goto(`${base}/vi/sign-in`, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.fill("input", email);
  await p.keyboard.press("Enter");
  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    await p.waitForTimeout(1000);
    const q = await (await fetch(`${mailpit}/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = q.messages?.find((x) => Date.parse(x.Created) >= since - 5000);
    if (m) {
      const msg = await (await fetch(`${mailpit}/message/${m.ID}`)).json();
      link = (msg.Text.match(/https?:\/\/\S+verify\S*/) ?? [null])[0];
    }
  }
  if (!link) throw new Error("magic link not found in Mailpit");
  await p.goto(link.replace(/^https?:\/\/[^/]+/, base), { waitUntil: "load" });
  await p.waitForTimeout(5000);
  await p.close();
  return ctx;
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

const manifest = {};
const browser = await pw.chromium.launch({ channel: "chrome" }).catch(() => pw.chromium.launch());
const ctx = await signIn(browser);
for (const loc of ["vi", "en"]) {
  const dir = join(root, "apps/app/assets/studio", loc);
  mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  for (const s of shots(crm(loc))) {
    await page.goto(`${base}/${loc}/${s.route}${email ? "" : "?demo=1"}`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    // Dev-only error overlays/toasts (Expo LogBox) must not end up in marketing captures.
    await page.addStyleTag({ content: "#error-overlay,#error-toast{display:none!important}" });
    await page.waitForTimeout(300);
    let clip;
    if (s.label) {
      const a = await cardOf(page, s.label, s.minH);
      if (!a) throw new Error(`label not found: ${loc} ${s.name} "${s.label}"`);
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
    }
    const png = join(dir, `${s.name}.png`);
    const buf = await page.screenshot({ path: png, ...(clip ? { clip } : {}) });
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const scale = clip ? 1 : 2400 / w;
    (manifest[loc] ??= {})[s.name] = { w: Math.round(w * scale), h: Math.round(h * scale) };
    try {
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
    } catch {
      /* keep PNG */
    }
    console.log("captured", loc, s.name);
  }
  await page.close();
}
await browser.close();
writeFileSync(
  join(root, "apps/app/assets/studio/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("wrote manifest.json");
