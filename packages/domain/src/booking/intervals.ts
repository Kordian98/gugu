/**
 * Half-open time intervals `[start, end)` in epoch milliseconds — the algebra the slot engine is
 * built on (docs/domains/booking-engine.md). Lists are kept sorted, non-overlapping and non-empty.
 */
export interface Interval {
  readonly start: number;
  readonly end: number;
}

/** Sorts, drops empty intervals and merges overlapping or touching ones. */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, i.end) };
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

/** Points covered by both lists. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const x = normalize(a);
  const y = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const p = x[i] as Interval;
    const q = y[j] as Interval;
    const start = Math.max(p.start, q.start);
    const end = Math.min(p.end, q.end);
    if (end > start) out.push({ start, end });
    if (p.end < q.end) i++;
    else j++;
  }
  return out;
}

/** Points of `a` not covered by `b`. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const cuts = normalize(b);
  const out: Interval[] = [];
  for (const piece of normalize(a)) {
    let cursor = piece.start;
    for (const c of cuts) {
      if (c.end <= cursor) continue;
      if (c.start >= piece.end) break;
      if (c.start > cursor) out.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
      if (cursor >= piece.end) break;
    }
    if (cursor < piece.end) out.push({ start: cursor, end: piece.end });
  }
  return out;
}

/** True when `inner` lies entirely inside one interval of `outer`. */
export function covers(outer: readonly Interval[], inner: Interval): boolean {
  return outer.some((o) => o.start <= inner.start && inner.end <= o.end);
}

/** True when the two half-open intervals share at least one point. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Total length of the overlap between `intervals` and `window`, in milliseconds. */
export function overlapLength(intervals: readonly Interval[], window: Interval): number {
  return intersect(intervals, [window]).reduce((sum, i) => sum + (i.end - i.start), 0);
}
