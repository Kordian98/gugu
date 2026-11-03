import { z } from "zod";
import type { Locale, TeamNotificationEvent } from "@gugu/contracts";
import { createI18n } from "@gugu/localization";
import { teamDef } from "../domain/catalog";

/**
 * Team email templates (topic 11 R21): copy lives in `packages/localization/locales/<locale>/
 * notifications.json` (`email.team.*`); this file only lays it out. Variables are validated with
 * Zod before rendering. There are no customer email templates: GuGu never emails a salon's
 * customers (X26). Never put verification codes, internal notes or customer phones in here.
 */

/** Variables of every team email. `when` is already formatted in the salon's timezone. */
export const teamEmailVarsSchema = z
  .object({
    salon: z.string().min(1).max(200),
    code: z.string().max(20).nullable(),
    when: z.string().max(120).nullable(),
    service: z.string().max(300).nullable(),
    staff: z.string().max(120).nullable(),
    customer: z.string().max(120).nullable(),
    link: z.url(),
  })
  .strict();
export type TeamEmailVars = z.infer<typeof teamEmailVarsSchema>;

/** Placeholders each template string may use (checked by the template coverage test). */
export const TEAM_PLACEHOLDERS = ["salon", "service", "when", "code"] as const;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Collapse whitespace/newlines in values that go into a subject or a single text line. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

interface Row {
  label: string;
  value: string;
}

function layout(input: {
  locale: Locale;
  brand: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  rows: Row[];
  after: string[];
  button?: { label: string; href: string } | undefined;
  footer: string;
}): string {
  const rows = input.rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6B6470;font-size:14px;white-space:nowrap;vertical-align:top">${escapeHtml(r.label)}</td><td style="padding:6px 0;font-size:15px;color:#25202A">${escapeHtml(r.value)}</td></tr>`,
    )
    .join("");
  const p = (s: string) =>
    `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:#25202A">${escapeHtml(s)}</p>`;
  return `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#F6F4F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;padding:28px">
<tr><td style="font-size:16px;font-weight:700;color:#25202A">${escapeHtml(input.brand)}</td></tr>
<tr><td style="padding-top:18px;font-size:21px;font-weight:700;color:#25202A">${escapeHtml(input.heading)}</td></tr>
<tr><td>${input.paragraphs.map(p).join("")}</td></tr>
<tr><td style="padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
${input.button ? `<tr><td style="padding-top:20px"><a href="${escapeHtml(input.button.href)}" style="display:inline-block;background:#25202A;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escapeHtml(input.button.label)}</a></td></tr>` : ""}
<tr><td>${input.after.map(p).join("")}</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:18px;color:#6B6470">${escapeHtml(input.footer)}</p>
</td></tr></table></body></html>`;
}

function text(heading: string, paragraphs: string[], rows: Row[], after: string[], footer: string) {
  return [
    heading,
    "",
    ...paragraphs,
    "",
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    ...after,
    "",
    "--",
    footer,
  ].join("\n");
}

export function renderTeamEmail(
  event: TeamNotificationEvent,
  locale: Locale,
  raw: TeamEmailVars,
): RenderedEmail {
  const v = teamEmailVarsSchema.parse(raw);
  const { t } = createI18n(locale);
  const def = teamDef(event);
  const vars = {
    salon: oneLine(v.salon),
    service: oneLine(v.service ?? ""),
    when: v.when ?? "",
    code: v.code ?? "",
  };
  const k = (part: string) => t(`notifications:email.team.${def.templateKey}.${part}`, vars);
  const L = (l: string) => t(`notifications:email.labels.${l}`);
  const rows: Row[] = [
    ...(v.service ? [{ label: L("service"), value: v.service }] : []),
    ...(v.when ? [{ label: L("when"), value: v.when }] : []),
    ...(v.staff ? [{ label: L("staff"), value: v.staff }] : []),
    ...(v.customer ? [{ label: L("customer"), value: v.customer }] : []),
    ...(v.code ? [{ label: L("code"), value: v.code }] : []),
  ];
  const footer = t("notifications:email.team.footer");
  const heading = k("heading");
  const button = {
    label: t(
      def.link === "zalo" ? "notifications:email.team.openZalo" : "notifications:email.team.open",
    ),
    href: v.link,
  };
  return {
    subject: oneLine(k("subject")),
    text: text(heading, [k("intro")], rows, [`${button.label}: ${v.link}`], footer),
    html: layout({
      locale,
      brand: v.salon,
      preheader: k("intro"),
      heading,
      paragraphs: [k("intro")],
      rows,
      after: [],
      button,
      footer,
    }),
  };
}
