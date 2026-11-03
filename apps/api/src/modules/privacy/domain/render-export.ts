import type { ClientExport, Locale } from "@gugu/contracts";
import { createI18n, formatDateLong, formatTime, formatVND } from "@gugu/localization";

/**
 * Human-readable renderings of privacy exports (topic 05 step 8). Pure: the same data as the JSON
 * export, labelled in the requested locale (`privacy` namespace), dates in the salon's timezone.
 * Status and event codes fall back to the raw code when no label exists.
 */

const when = (iso: string, locale: Locale, tz: string) => {
  const d = new Date(iso);
  return `${formatDateLong(d, locale, tz)} ${formatTime(d, locale, tz)}`;
};

export function renderClientExportText(data: ClientExport, locale: Locale, tz: string): string {
  const { t, exists } = createI18n(locale);
  const f = (k: string) => t(`privacy:export.fields.${k}`);
  const none = t("privacy:export.none");
  const label = (key: string, fallback: string) => (exists(key) ? t(key) : fallback);
  const status = (s: string) => label(`crm:booking.status.${s}`, s);
  const section = (k: string) => {
    const title = t(`privacy:export.sections.${k}`);
    return ["", title, "=".repeat(title.length)];
  };
  const line = (k: string, v: string | null | undefined) => `${f(k)}: ${v && v !== "" ? v : none}`;
  const c = data.client;
  const consent = (["zalo", "email", "sms"] as const)
    .map(
      (ch) =>
        `${t(`privacy:export.consentChannels.${ch}`)} ${t(`privacy:export.${c.marketingConsent[ch] ? "yes" : "no"}`)}`,
    )
    .join(", ");

  const out: string[] = [
    t("privacy:export.title", { salon: data.salon.name }),
    t("privacy:export.generatedAt", { at: when(data.exportedAt, locale, tz) }),
    "",
    t("privacy:export.intro"),
    t("privacy:export.disclaimer"),
    ...section("client"),
    line("name", c.displayName),
    line("phone", c.phone),
    line("email", c.email),
    line("tags", c.tags.join(", ")),
    line("consent", consent),
    line("source", c.source),
    line("createdAt", when(c.createdAt, locale, tz)),
    ...section("bookings"),
  ];
  if (data.bookings.length === 0) out.push(none);
  for (const b of data.bookings) {
    out.push(
      "",
      `#${b.referenceCode} · ${when(b.startsAt, locale, tz)} · ${status(b.status)}`,
      line(
        "services",
        b.services.map((s) => (locale === "en" && s.name.en) || s.name.vi).join(", "),
      ),
      line("total", formatVND(b.totalPriceMinor, locale)),
      line("name", b.customerName),
      line("phone", b.customerPhone),
      line("note", b.customerNote),
    );
    if (b.cancellationReason) out.push(line("cancellation", b.cancellationReason));
    if (b.payment) {
      out.push(
        line(
          "payment",
          `${formatVND(b.payment.amountMinor, locale)} · ${when(b.payment.recordedAt, locale, tz)}`,
        ),
      );
    }
    if (b.history.length) {
      out.push(`${f("history")}:`);
      for (const h of b.history) {
        const reason = [h.reasonCode, h.reasonText].filter(Boolean).join(" — ");
        out.push(
          `  - ${when(h.at, locale, tz)}: ${h.from ? `${status(h.from)} → ` : ""}${status(h.to)}${reason ? ` (${reason})` : ""}`,
        );
      }
    }
  }
  out.push(...section("notes"));
  if (data.notes.length === 0) out.push(none);
  for (const n of data.notes) out.push(`- ${when(n.createdAt, locale, tz)}: ${n.body}`);
  out.push(...section("zalo"));
  if (data.zalo.length === 0) out.push(none);
  for (const conv of data.zalo) {
    out.push(line("name", conv.displayName), line("phone", conv.phone));
    for (const m of conv.messages) {
      const arrow = m.direction === "inbound" ? "←" : "→";
      out.push(`  ${when(m.at, locale, tz)} ${arrow} [${m.sender}] ${m.text ?? `(${m.kind})`}`);
    }
  }
  return `${out.join("\n")}\n`;
}

export interface CsvClientRow {
  displayName: string;
  phone: string | null;
  tags: string[];
  consent: { zalo: boolean; email: boolean; sms: boolean };
  visits: number;
  lastVisitAt: string | null;
  createdAt: string;
}

/** RFC 4180 field; also neutralises spreadsheet formulas (CSV injection: =, +, -, @, tab, CR). */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const BOM = "\uFEFF";

/** Client list as CSV (UTF-8 with BOM so spreadsheet apps read Vietnamese correctly). */
export function renderClientsCsv(rows: readonly CsvClientRow[], locale: Locale): string {
  const { t } = createI18n(locale);
  const h = (k: string) => t(`privacy:csv.${k}`);
  const header = [
    "name",
    "phone",
    "tags",
    "consentZalo",
    "consentEmail",
    "consentSms",
    "visits",
    "lastVisit",
    "createdAt",
  ].map(h);
  const yes = (b: boolean) => (b ? "1" : "0");
  const lines = [
    header,
    ...rows.map((r) => [
      r.displayName,
      r.phone ?? "",
      r.tags.join("; "),
      yes(r.consent.zalo),
      yes(r.consent.email),
      yes(r.consent.sms),
      String(r.visits),
      r.lastVisitAt ?? "",
      r.createdAt,
    ]),
  ];
  return `${BOM}${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`;
}
