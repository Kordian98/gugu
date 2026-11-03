import { describe, expect, it } from "vitest";
import type { ClientExport } from "@gugu/contracts";
import { csvField, renderClientExportText, renderClientsCsv } from "./render-export";

const data: ClientExport = {
  format: "gugu.client-export.v1",
  exportedAt: "2026-11-03T03:00:00.000Z",
  salon: { id: "0190f000-0000-7000-8000-000000000001", name: "Salon Hoa" },
  client: {
    id: "0190f000-0000-7000-8000-000000000002",
    displayName: "Nguyễn Thị Lan",
    phone: "+84901234567",
    email: "lan@example.vn",
    tags: ["VIP"],
    marketingConsent: { zalo: true, email: false, sms: false },
    source: "manual",
    createdAt: "2026-10-01T03:00:00.000Z",
  },
  bookings: [
    {
      id: "0190f000-0000-7000-8000-000000000003",
      referenceCode: "AB12",
      status: "completed",
      source: "staff_created",
      startsAt: "2026-10-10T03:00:00.000Z",
      endsAt: "2026-10-10T04:00:00.000Z",
      services: [{ name: { vi: "Cắt tóc", en: "Haircut" }, priceMinor: 200000 }],
      totalPriceMinor: 200000,
      currency: "VND",
      customerName: "Nguyễn Thị Lan",
      customerPhone: "+84901234567",
      customerNote: "Tóc ngắn",
      cancellationReason: null,
      createdAt: "2026-10-01T03:00:00.000Z",
      payment: null,
      history: [
        {
          from: null,
          to: "confirmed",
          at: "2026-10-01T03:00:00.000Z",
          reasonCode: null,
          reasonText: null,
        },
      ],
    },
  ],
  notes: [{ body: "Thích trà gừng", createdAt: "2026-10-10T05:00:00.000Z" }],
  zalo: [],
};

describe("renderClientExportText", () => {
  it("renders every section in vi and en with the data", () => {
    for (const locale of ["vi", "en"] as const) {
      const text = renderClientExportText(data, locale, "Asia/Ho_Chi_Minh");
      expect(text).toContain("Salon Hoa");
      expect(text).toContain("Nguyễn Thị Lan");
      expect(text).toContain("+84901234567");
      expect(text).toContain("#AB12");
      expect(text).toContain("Thích trà gừng");
      expect(text).toContain("lan@example.vn");
      expect(text).toContain(locale === "vi" ? "Cắt tóc" : "Haircut");
      expect(text).not.toMatch(/privacy:|export\.fields/);
    }
    expect(renderClientExportText(data, "vi", "Asia/Ho_Chi_Minh")).toContain("Hồ sơ khách");
    expect(renderClientExportText(data, "en", "Asia/Ho_Chi_Minh")).toContain("Client profile");
  });

  it("never claims compliance", () => {
    for (const locale of ["vi", "en"] as const) {
      const text = renderClientExportText(data, locale, "Asia/Ho_Chi_Minh").toLowerCase();
      expect(text).not.toMatch(/compliant|tuân thủ/);
    }
  });
});

describe("CSV", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+84901")).toBe("'+84901");
  });

  it("has a BOM, localized header and one row per client", () => {
    const csv = renderClientsCsv(
      [
        {
          displayName: "Lan",
          phone: "+84901234567",
          tags: ["VIP", "new"],
          consent: { zalo: true, email: false, sms: false },
          visits: 3,
          lastVisitAt: "2026-10-10T03:00:00.000Z",
          createdAt: "2026-10-01T03:00:00.000Z",
        },
      ],
      "vi",
    );
    expect(csv.startsWith("﻿Tên,Số điện thoại")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(2);
    expect(csv).toContain("Lan,'+84901234567,VIP; new,1,0,0,3");
  });
});
