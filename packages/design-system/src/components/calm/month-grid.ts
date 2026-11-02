// Pure calendar-date helpers for DatePicker (no React Native import, unit-testable).

/** `YYYY-MM-DD` helpers on calendar dates (no time zone involved). */
export const toYmd = (y: number, m: number, d: number) =>
  `${String(y)}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y ?? 1970, m: (m ?? 1) - 1, d: d ?? 1 };
};

/** Monday-first month grid: leading/trailing nulls, then `YYYY-MM-DD` for each day. */
export function monthCells(year: number, month: number): (string | null)[] {
  const daysIn = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => toYmd(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  return cells;
}
