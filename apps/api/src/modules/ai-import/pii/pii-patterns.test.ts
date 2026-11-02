import { describe, expect, it } from "vitest";
import { containsContactDetails, findContactDetails, findNameWords } from "./pii-patterns";
import { planRedactions, type OcrWord } from "./redaction-plan";

const kinds = (s: string) => findContactDetails(s).map((m) => [m.kind, s.slice(m.start, m.end)]);

describe("findContactDetails", () => {
  it.each([
    ["Hotline: 0912 345 678", "0912 345 678"],
    ["Zalo 0987.654.321", "0987.654.321"],
    ["Gọi +84 912-345-678 nhé", "+84 912-345-678"],
    ["ĐT: 028 3822 1234", "028 3822 1234"],
    ["84912345678", "84912345678"],
  ])("finds the phone number in %s", (text, phone) => {
    expect(kinds(text)).toContainEqual(["phone", phone]);
  });

  it("does not treat prices or durations as phone numbers", () => {
    for (const s of ["Sơn gel 150.000đ", "350.000đ - 450.000đ", "60 phút", "120k", "1.200.000 VND"])
      expect(findContactDetails(s).filter((m) => m.kind === "phone")).toEqual([]);
  });

  it("finds emails, links and handles", () => {
    const text =
      "lotus.nail@gmail.com fb.com/lotusnail https://zalo.me/123 @lotus_nail www.lotus.vn";
    const found = kinds(text);
    expect(found).toContainEqual(["email", "lotus.nail@gmail.com"]);
    expect(found).toContainEqual(["url", "fb.com/lotusnail"]);
    expect(found).toContainEqual(["url", "https://zalo.me/123"]);
    expect(found).toContainEqual(["handle", "@lotus_nail"]);
    expect(found).toContainEqual(["url", "www.lotus.vn"]);
  });

  it("finds nothing in a plain price line", () => {
    expect(containsContactDetails("Nối mi classic (60 phút) 350.000đ")).toBe(false);
  });
});

describe("findNameWords", () => {
  const words = (s: string) => s.split(" ");
  it("flags honorific + capitalised name", () => {
    const w = words("Đắp bột: anh Tuấn phụ trách");
    expect(findNameWords(w).map((i) => w[i])).toEqual(["anh", "Tuấn"]);
  });
  it("handles multi-word prefixes and up to three name words", () => {
    const w = words("kỹ thuật viên Nguyễn Thị Lan làm");
    expect(findNameWords(w).map((i) => w[i])).toEqual([
      "kỹ",
      "thuật",
      "viên",
      "Nguyễn",
      "Thị",
      "Lan",
    ]);
  });
  it("ignores honorifics without a capitalised word after them", () => {
    expect(findNameWords(words("combo chị em giảm 10%"))).toEqual([]);
  });
  it("flags role labels like KTV and Stylist", () => {
    const w = words("KTV Hoa - Stylist Minh");
    expect(findNameWords(w).map((i) => w[i])).toEqual(["KTV", "Hoa", "Stylist", "Minh"]);
  });
});

describe("planRedactions", () => {
  const box = (i: number) => ({ x0: i * 10, y0: 0, x1: i * 10 + 8, y1: 10 });
  const line = (s: string): OcrWord[] => s.split(" ").map((text, i) => ({ text, bbox: box(i) }));

  it("redacts every word of a phone number split by OCR", () => {
    const r = planRedactions([line("Hotline: 0912 345 678")]);
    expect(r.map((x) => x.kind)).toEqual(["phone", "phone", "phone"]);
    expect(r.map((x) => x.box.x0)).toEqual([10, 20, 30]);
  });

  it("keeps service names and prices", () => {
    expect(planRedactions([line("Sơn gel tay 150.000đ")])).toEqual([]);
  });

  it("combines names and contacts on one line", () => {
    const r = planRedactions([line("anh Tuấn 0912345678")]);
    expect(r.map((x) => x.kind).sort()).toEqual(["name", "name", "phone"]);
  });
});
