import { describe, expect, it, vi } from "vitest";

import { MOBILE_CSS, QA_CSS } from "./mobile.css";

// the sheet only needs the token values; the package index also exports React Native components
vi.mock("@gugu/design-system", () => import("@gugu/design-system/tokens"));

/** Brace depth after each character; comments and strings never contain braces in this sheet. */
const depths = (css: string) => {
  const out: number[] = [];
  let d = 0;
  for (const ch of css) {
    if (ch === "{") d++;
    else if (ch === "}") d--;
    out.push(d);
  }
  return out;
};

describe("mobile story CSS", () => {
  for (const [name, css] of [
    ["MOBILE_CSS", MOBILE_CSS],
    ["QA_CSS", QA_CSS],
  ] as const) {
    it(`${name}: every rule stays inside the phone media query`, () => {
      const body = css.slice(css.indexOf("@media (max-width:899px){"));
      const d = depths(body);
      const end = body.lastIndexOf("}");
      // depth first returns to 0 at the media query's own closing brace, which is the last brace
      expect(d.indexOf(0, body.indexOf("{"))).toBe(end);
      expect(body.slice(end + 1).trim()).toBe("");
      expect(Math.min(...d)).toBeGreaterThanOrEqual(0);
    });
  }
  it("starts with the phone media query (desktop never sees a rule)", () => {
    expect(MOBILE_CSS.trim().startsWith("@media (max-width:899px){")).toBe(true);
    expect(QA_CSS.trim().startsWith("@media (max-width:899px){")).toBe(true);
  });
  it("chip labels are ink, never ink2 (ink2 on chip glass is below AA over dark frames)", () => {
    for (const sel of [".mj-grp .lb", ".mj-toast small", ".mc-toast small"]) {
      const rule = MOBILE_CSS.slice(MOBILE_CSS.indexOf(`${sel}{`)).split("}")[0];
      expect(rule).toContain("color:#221024");
    }
  });
});
