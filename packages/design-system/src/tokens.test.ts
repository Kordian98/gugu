import { describe, expect, it } from "vitest";

import { color, font, gradient, motion, typeScale } from "./tokens";

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
  it("gradients have at least 2 stops", () => {
    for (const g of Object.values(gradient)) expect(g.length).toBeGreaterThanOrEqual(2);
  });
});
