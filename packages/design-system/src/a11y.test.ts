import { describe, expect, it } from "vitest";

import { checkableA11y } from "./a11y";

describe("checkableA11y", () => {
  it("exposes the checked state as ARIA (react-native-web drops accessibilityState)", () => {
    expect(checkableA11y("switch", true)).toEqual({
      role: "switch",
      accessibilityRole: "switch",
      accessibilityState: { checked: true },
      "aria-checked": true,
    });
    expect(checkableA11y("checkbox", false)["aria-checked"]).toBe(false);
    expect(checkableA11y("radio", true).role).toBe("radio");
  });
  it("carries disabled only when given", () => {
    expect(checkableA11y("switch", false, { disabled: true })).toMatchObject({
      "aria-disabled": true,
      accessibilityState: { checked: false, disabled: true },
    });
    expect(checkableA11y("switch", false)).not.toHaveProperty("aria-disabled");
  });
});
