import { describe, expect, it } from "vitest";

import { color, font, gradient, liquidGlass, motion, typeScale } from "./tokens";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("tokens", () => {
  it("uses the Lilac Glow brand colours that match the delivered logo", () => {
    expect(color.lilac500).toBe("#A98BEB");
    expect(color.plum950).toBe("#2A1426");
    expect(color.pink300).toBe("#F6B8CC");
  });
  it("defines the three font roles", () => {
    expect(font.display).toContain("NotoSerifDisplay");
    expect(font.ui).toContain("BeVietnamPro");
    expect(font.script).toContain("PatrickHand");
  });
  it("motion durations follow the skill scale", () => {
    expect(motion.duration).toEqual({ fast: 120, base: 200, slow: 320, deliberate: 500 });
  });
  it("body text in the type scale is at least 16 px", () => {
    expect(typeScale.body).toBeGreaterThanOrEqual(16);
  });
  it("lineStrong reaches 3:1 on white (non-text contrast)", () => {
    expect(contrast(color.lineStrong, color.white)).toBeGreaterThanOrEqual(3);
    expect(contrast(color.lineStrong, color.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(color.lineStrong, color.tile)).toBeGreaterThanOrEqual(3);
  });
  it("glowInk stops stay readable on canvas", () => {
    for (const stop of gradient.glowInk)
      expect(contrast(stop, color.canvas)).toBeGreaterThanOrEqual(4.3);
  });
  describe("liquid glass", () => {
    type Rgba = [number, number, number, number];
    const parse = (rgba: string) => (rgba.match(/[\d.]+/g) ?? []).map(Number) as Rgba;
    /** `layers` (rgba strings, bottom → top) composited over an opaque rgb backdrop → hex. */
    const over = (backdrop: [number, number, number], ...layers: string[]) => {
      const out = layers
        .map(parse)
        .reduce<[number, number, number]>(
          (acc, [r, g, b, a]) => [
            r * a + acc[0] * (1 - a),
            g * a + acc[1] * (1 - a),
            b * a + acc[2] * (1 - a),
          ],
          backdrop,
        );
      return `#${out.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    };
    const black: [number, number, number] = [0, 0, 0];
    const g = liquidGlass;
    it("is visibly translucent (tint alpha 0.2–0.5 on panels, ≤ 0.6 on chips)", () => {
      for (const t of [g.panelTop, g.panelBottom]) {
        const a = parse(t)[3];
        expect(a).toBeGreaterThanOrEqual(0.2);
        expect(a).toBeLessThanOrEqual(0.5);
      }
      for (const t of [g.chipTop, g.chipBottom]) expect(parse(t)[3]).toBeLessThanOrEqual(0.6);
    });
    it("text on panel + veil passes AA even over a black backdrop", () => {
      for (const p of [g.panelTop, g.panelBottom]) {
        const bg = over(black, p, g.veil);
        expect(contrast(color.ink, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color.ink2, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it("chip labels (ink) pass AA even over a black backdrop", () => {
      for (const c of [g.chipTop, g.chipBottom])
        expect(contrast(color.ink, over(black, c))).toBeGreaterThanOrEqual(4.5);
    });
    it("text in wells passes AA over black", () => {
      const bg = over(black, g.panelBottom, g.well);
      expect(contrast(color.ink2, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
  it("gradients have at least 2 stops", () => {
    for (const g of Object.values(gradient)) expect(g.length).toBeGreaterThanOrEqual(2);
  });
});
