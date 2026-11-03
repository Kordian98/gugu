import { describe, expect, it } from "vitest";
import { AppError } from "../../../common/problem/app-error";
import { aiCostMonth } from "../../ai-import/ai-import.facade";
import { decodeOffset, encodeOffset } from "./cursor";
import { monthRange } from "./admin-usage.queries";

describe("admin usage month (Asia/Ho_Chi_Minh, the AI cap period)", () => {
  it("maps a VN calendar month to its UTC range", () => {
    expect(monthRange("2026-11")).toEqual({
      start: new Date("2026-10-31T17:00:00Z"),
      end: new Date("2026-11-30T17:00:00Z"),
    });
    expect(monthRange("2026-12").end).toEqual(new Date("2026-12-31T17:00:00Z"));
  });

  it("agrees with the cost meter's month key at the boundary", () => {
    const { start, end } = monthRange("2026-12");
    expect(aiCostMonth(start)).toBe("2026-12");
    expect(aiCostMonth(new Date(start.getTime() - 1))).toBe("2026-11");
    expect(aiCostMonth(new Date(end.getTime() - 1))).toBe("2026-12");
  });
});

describe("admin offset cursor", () => {
  it("round-trips and starts at 0", () => {
    expect(decodeOffset(undefined)).toBe(0);
    expect(decodeOffset(encodeOffset(150))).toBe(150);
  });

  it("rejects tampered cursors", () => {
    for (const bad of [
      "nope",
      Buffer.from("o:-1").toString("base64url"),
      Buffer.from("o:99999999").toString("base64url"),
    ]) {
      expect(() => decodeOffset(bad)).toThrow(AppError);
    }
  });
});
