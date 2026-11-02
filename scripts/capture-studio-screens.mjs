#!/usr/bin/env node
/**
 * Captures REAL GuGu Studio CRM screens (business workspace, ?demo=1 data) for the marketing landing.
 * Re-run whenever the CRM changes:
 *
 *   pnpm --filter @gugu/app web --port 8094         # or any running dev server
 *   node scripts/capture-studio-screens.mjs http://localhost:8094
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
];

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
for (const loc of ["vi", "en"]) {
  const dir = join(root, "apps/app/assets/studio", loc);
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  for (const s of shots(crm(loc))) {
    await page.goto(`${base}/${loc}/${s.route}?demo=1`, { waitUntil: "load" });
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
    const scale = clip ? 1 : 1800 / w;
    (manifest[loc] ??= {})[s.name] = { w: Math.round(w * scale), h: Math.round(h * scale) };
    try {
      execFileSync("cwebp", [
        "-quiet",
        "-q",
        "82",
        "-resize",
        clip ? "0" : "1800",
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
