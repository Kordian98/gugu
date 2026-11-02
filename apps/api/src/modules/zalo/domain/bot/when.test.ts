import { describe, expect, it } from "vitest";
import { dayPartOf, parseWhen } from "./when";

const TODAY = "2026-11-03"; // a Tuesday

describe("parseWhen", () => {
  it.each([
    ["mai 15h", { date: "2026-11-04", minute: 900, part: "afternoon" }],
    ["Thứ 7 sáng", { date: "2026-11-07", minute: null, part: "morning" }],
    ["hôm nay 9h30", { date: TODAY, minute: 570, part: "morning" }],
    ["15/11 14:00", { date: "2026-11-15", minute: 840, part: "afternoon" }],
    ["2/1 10h", { date: "2027-01-02", minute: 600, part: "morning" }],
    ["3h chiều", { date: null, minute: 900, part: "afternoon" }],
    ["chiều mai", { date: "2026-11-04", minute: null, part: "afternoon" }],
    ["tối thứ 3", { date: TODAY, minute: null, part: "evening" }],
    ["chủ nhật", { date: "2026-11-08", minute: null, part: null }],
    ["tomorrow 3pm", { date: "2026-11-04", minute: 900, part: "afternoon" }],
    ["ngày mốt 18h", { date: "2026-11-05", minute: 1080, part: "evening" }],
  ] as const)("%s", (text, expected) => {
    expect(parseWhen(text, TODAY)).toEqual(expected);
  });

  it("ignores text without a day, time or part of day", () => {
    expect(parseWhen("giá bao nhiêu vậy", TODAY)).toBeNull();
    expect(parseWhen("2", TODAY)).toBeNull();
  });

  it("groups minutes into parts of the day", () => {
    expect([dayPartOf(11 * 60 + 59), dayPartOf(12 * 60), dayPartOf(17 * 60)]).toEqual([
      "morning",
      "afternoon",
      "evening",
    ]);
  });
});
