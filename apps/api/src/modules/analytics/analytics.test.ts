import { describe, expect, it } from "vitest";
import { ANALYTICS_DENIED_PROPS, ANALYTICS_EVENTS } from "@gugu/contracts";

describe("analytics catalogue", () => {
  it("declares no PII property names", () => {
    for (const [name, schema] of Object.entries(ANALYTICS_EVENTS)) {
      for (const prop of Object.keys(schema.shape)) {
        const denied = ANALYTICS_DENIED_PROPS.some((d) => prop === d || prop.endsWith(`_${d}`));
        expect(denied, `${name}.${prop}`).toBe(false);
      }
    }
  });

  it("rejects unknown properties (strict schemas)", () => {
    expect(
      ANALYTICS_EVENTS.setup_step_viewed.safeParse({ step: "hours", step_index: 1, email: "x" })
        .success,
    ).toBe(false);
  });
});
