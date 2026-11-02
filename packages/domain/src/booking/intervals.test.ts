import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  covers,
  intersect,
  type Interval,
  normalize,
  overlapLength,
  overlaps,
  subtract,
} from "./intervals";

const iv = (start: number, end: number): Interval => ({ start, end });

const arbIntervals = fc.array(
  fc
    .tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 40 }))
    .map(([s, l]) => iv(s, s + l)),
  { maxLength: 12 },
);

/** Point-membership oracle over integer points. */
const has = (list: readonly Interval[], p: number) => list.some((i) => i.start <= p && p < i.end);

describe("intervals", () => {
  it("normalize sorts, merges touching/overlapping and drops empty", () => {
    expect(normalize([iv(5, 7), iv(1, 3), iv(3, 4), iv(6, 9), iv(10, 10)])).toEqual([
      iv(1, 4),
      iv(5, 9),
    ]);
  });

  it("intersect and subtract", () => {
    expect(intersect([iv(0, 10), iv(20, 30)], [iv(5, 25)])).toEqual([iv(5, 10), iv(20, 25)]);
    expect(subtract([iv(0, 10)], [iv(2, 3), iv(5, 7)])).toEqual([iv(0, 2), iv(3, 5), iv(7, 10)]);
    expect(subtract([iv(0, 10)], [iv(-5, 20)])).toEqual([]);
    expect(subtract([iv(0, 10)], [])).toEqual([iv(0, 10)]);
    expect(subtract([iv(0, 10)], [iv(20, 30)])).toEqual([iv(0, 10)]);
  });

  it("covers, overlaps and overlapLength", () => {
    expect(covers([iv(0, 10)], iv(0, 10))).toBe(true);
    expect(covers([iv(0, 5), iv(5, 10)], iv(4, 6))).toBe(false);
    expect(overlaps(iv(0, 5), iv(5, 10))).toBe(false);
    expect(overlaps(iv(0, 6), iv(5, 10))).toBe(true);
    expect(overlapLength([iv(0, 5), iv(8, 12)], iv(3, 10))).toBe(4);
  });

  it("property: set semantics match a point oracle", () => {
    fc.assert(
      fc.property(arbIntervals, arbIntervals, (a, b) => {
        const inter = intersect(a, b);
        const diff = subtract(a, b);
        for (let p = 0; p < 245; p++) {
          expect(has(inter, p)).toBe(has(a, p) && has(b, p));
          expect(has(diff, p)).toBe(has(a, p) && !has(b, p));
        }
        for (const list of [inter, diff, normalize(a)]) {
          for (let k = 1; k < list.length; k++) {
            expect((list[k] as Interval).start).toBeGreaterThan((list[k - 1] as Interval).end - 1);
          }
        }
      }),
    );
  });
});
