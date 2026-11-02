import { describe, expect, it } from "vitest";
import { z } from "zod";
import { entityTokenSchema } from "@gugu/contracts";
import { pickRoute } from "../application/routing";
import { checkToolResult } from "./allowlist";
import { findNames, fold } from "./names";
import { StreamRehydrator } from "./rehydrate";
import {
  containsPersonalData,
  type Directory,
  isCommonWord,
  isFixedVocabulary,
  scrubUserText,
} from "./scrubber";
import type { TokenVault } from "./token-vault";

/** In-memory stand-in with the same token rules as the DB-backed vault. */
function memoryVault(): TokenVault {
  const map = new Map<string, string>();
  return {
    tokenFor: (kind: string, id: string) => {
      const key = `${kind}:${id}`;
      if (!map.has(key)) {
        const n = [...map.keys()].filter((k) => k.startsWith(`${kind}:`)).length + 1;
        map.set(key, `${kind}_${String(n)}`);
      }
      return Promise.resolve(map.get(key) ?? "");
    },
  } as unknown as TokenVault;
}

const directory: Directory = {
  staff: [
    { id: "s1", name: "Thu" },
    { id: "s2", name: "Nguyễn Văn Tuấn" },
  ],
  customers: ["Trần Thị Bích", "Lan", "Lịch", "Vietnamese"],
  salon: ["Lotus Nail"],
};

describe("fold", () => {
  it("removes Vietnamese diacritics and case, 1:1 with the original", () => {
    const s = "Đặng Thị Ánh";
    expect(fold(s)).toBe("dang thi anh");
    expect(fold(s)).toHaveLength(s.normalize("NFC").length);
  });
});

const staffList = (...names: string[]) => [{ names, singleWord: "capital_or_cue" as const }];
const customerList = (...names: string[]) => [{ names, singleWord: "capital_and_cue" as const }];

describe("findNames", () => {
  it("matches multi-word names without diacritics or case", () => {
    expect(
      findNames("lich cua nguyen van tuan hom nay", staffList("Nguyễn Văn Tuấn")),
    ).toHaveLength(1);
    expect(findNames("lich cua nguyen van tuan", customerList("Nguyễn Văn Tuấn"))).toHaveLength(1);
  });
  it("matches single-word staff names when capitalised or after a cue", () => {
    expect(findNames("doanh thu tháng này", staffList("Thu"))).toEqual([]);
    expect(findNames("Thu có mấy lịch", staffList("Thu"))).toHaveLength(1);
    expect(findNames("lịch của chị thu", staffList("Thu"))).toHaveLength(1);
    expect(findNames("ktv thu hôm nay", staffList("Thu"))).toHaveLength(1);
  });
  it("matches single-word customer names only when capitalised AND after a cue", () => {
    expect(findNames("Lịch hôm nay thế nào?", customerList("Lịch"))).toEqual([]);
    expect(findNames("khách lịch hủy chưa", customerList("Lịch"))).toEqual([]);
    expect(
      findNames("Context: Reply in Vietnamese", customerList("Vietnamese", "Context")),
    ).toEqual([]);
    expect(findNames("khách Hoa hủy chưa", customerList("Hoa"))).toHaveLength(1);
    expect(findNames("chị Hoa đến chưa", customerList("Hoa"))).toHaveLength(1);
  });
  it("never lets a customer list weaken a staff entry with the same name", () => {
    expect(
      findNames("Thu có mấy lịch", [...staffList("Thu"), ...customerList("Thu")]),
    ).toHaveLength(1);
    expect(
      findNames("Thu có mấy lịch", [...customerList("Thu"), ...staffList("Thu")]),
    ).toHaveLength(1);
  });
  it("respects word boundaries", () => {
    expect(findNames("Lanh hay Lan?", staffList("Lan")).map((s) => s.start)).toEqual([9]);
  });
});

describe("scrubUserText", () => {
  it("turns staff into tokens and redacts customers, the salon and contact details", async () => {
    const r = await scrubUserText(
      "Chị Thu và Nguyễn Văn Tuấn có bao nhiêu lịch? Khách Trần Thị Bích (0912 345 678, bich@gmail.com) ở Lotus Nail",
      directory,
      memoryVault(),
    );
    expect(r.changed).toBe(true);
    expect(r.text).toBe(
      "Chị staff_1 và staff_2 có bao nhiêu lịch? Khách [redacted_name] ([redacted_phone], [redacted_email]) ở [salon]",
    );
    expect(containsPersonalData(r.text, directory)).toBe(false);
  });

  it("masks a customer named like a staff member as that staff member", async () => {
    const dir: Directory = { ...directory, customers: [...directory.customers, "Thu"] };
    const r = await scrubUserText("Thu có mấy lịch hôm nay?", dir, memoryVault());
    expect(r.text).toBe("staff_1 có mấy lịch hôm nay?");
    expect(containsPersonalData(r.text, dir)).toBe(false);
  });

  it("masks a customer named like a common word, but never blocks the question", async () => {
    // Over-masking is safe; blocking would let a customer disable the assistant.
    const r = await scrubUserText("Lịch hôm nay thế nào?", directory, memoryVault());
    expect(r).toEqual({ text: "[redacted_name] hôm nay thế nào?", changed: true });
    expect(containsPersonalData("Lịch hôm nay thế nào? Doanh thu?", directory)).toBe(false);
    expect(
      containsPersonalData("Context: today is 2026-11-03. Reply in Vietnamese.", directory),
    ).toBe(false);
    // Lower-case common words are not masked at all.
    expect((await scrubUserText("lịch hôm nay thế nào?", directory, memoryVault())).changed).toBe(
      false,
    );
  });

  it("blocks a real customer name that survived scrubbing", () => {
    expect(containsPersonalData("khách Trần Thị Bích đến chưa?", directory)).toBe(true);
    expect(containsPersonalData("khách Lan đến chưa?", directory)).toBe(false); // "lan" is a common word
  });

  it("leaves ordinary questions alone", async () => {
    const r = await scrubUserText("Doanh thu tháng này là bao nhiêu?", directory, memoryVault());
    expect(r).toEqual({ text: "Doanh thu tháng này là bao nhiêu?", changed: false });
  });
});

describe("checkToolResult", () => {
  const schema = z.strictObject({
    total: z.number(),
    rows: z.array(z.strictObject({ staff: entityTokenSchema("staff"), status: z.string() })),
  });
  it("passes tokens, numbers and enums", () => {
    expect(
      checkToolResult(schema, { total: 2, rows: [{ staff: "staff_1", status: "confirmed" }] }),
    ).toMatchObject({ ok: true });
  });
  it("withholds an extra field (e.g. a name)", () => {
    expect(
      checkToolResult(schema, {
        total: 2,
        rows: [{ staff: "staff_1", status: "confirmed", name: "Lan" }],
      }),
    ).toMatchObject({ ok: false, reason: "schema" });
  });
  it("withholds free text in an allowed string field", () => {
    expect(
      checkToolResult(schema, { total: 1, rows: [{ staff: "staff_1", status: "chị Lan VIP" }] }),
    ).toEqual({ ok: false, path: "rows.0.status", reason: "string" });
  });
});

describe("StreamRehydrator", () => {
  const names = new Map([
    ["staff_1", "Thu"],
    ["staff_12", "Hà"],
  ]);
  it("replaces tokens split across stream pieces", () => {
    const r = new StreamRehydrator((t) => names.get(t));
    const out =
      ["Hôm nay sta", "ff_1 có 3 lịch, staff_1", "2 có 1."].map((p) => r.push(p)).join("") +
      r.flush();
    expect(out).toBe("Hôm nay Thu có 3 lịch, Hà có 1.");
  });
  it("leaves unknown tokens as they are", () => {
    const r = new StreamRehydrator((t) => names.get(t));
    expect(r.push("service_9 ") + r.flush()).toBe("service_9 ");
  });
});

describe("pickRoute", () => {
  it("sends simple questions to the fast route and comparisons to standard", () => {
    expect(pickRoute("Hôm nay có bao nhiêu lịch hẹn?")).toBe("fast");
    expect(pickRoute("So sánh doanh thu tháng này với tháng trước")).toBe("standard");
    expect(pickRoute("How did March compare to February?")).toBe("standard");
  });
});

describe("egress exclusions", () => {
  it("treats enums, period labels, placeholders and token shapes as fixed vocabulary", () => {
    for (const n of [
      "Confirmed",
      "no show",
      "No_Show",
      "today",
      "Last month",
      "staff_1",
      "Booking_7",
      "salon",
      "VND",
    ]) {
      expect(isFixedVocabulary(n)).toBe(true);
    }
    for (const n of ["Nguyễn Văn Tuấn", "Trần Thị Bích"]) expect(isFixedVocabulary(n)).toBe(false);
  });
  it("knows common question words", () => {
    for (const n of ["Lịch", "doanh thu", "Vietnamese", "Context"])
      expect(isCommonWord(n)).toBe(true);
    expect(isCommonWord("Trần Thị Bích")).toBe(false);
  });
});
