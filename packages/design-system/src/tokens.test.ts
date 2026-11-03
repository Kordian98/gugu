import { describe, expect, it } from "vitest";

import { color, font, gradient, motion } from "./tokens";

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
  it("gradients have at least 2 stops", () => {
    for (const g of Object.values(gradient)) expect(g.length).toBeGreaterThanOrEqual(2);
  });
});
