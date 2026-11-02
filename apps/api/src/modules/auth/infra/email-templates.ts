import { createI18n } from "@gugu/localization";
import type { Locale } from "@gugu/contracts";
import type { OutgoingMail } from "../../../infrastructure/mail/mail.service";

export type MagicLinkTemplate = "magicLink" | "salonRegistration";

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Localized magic-link email (vi/en dictionaries in packages/localization `email` namespace). */
export function renderMagicLinkEmail(input: {
  template: MagicLinkTemplate;
  locale: Locale;
  to: string;
  link: string;
  code: string;
  salonName?: string;
}): OutgoingMail {
  const { t } = createI18n(input.locale);
  const k = (key: string) =>
    t(`email:${input.template}.${key}`, { salonName: input.salonName ?? "" });
  const subject = k("subject");
  const text = [
    k("heading"),
    "",
    k("body"),
    "",
    input.link,
    "",
    `${k("codeIntro")} ${input.code}`,
    "",
    k("ignore"),
    "",
    t("email:footer"),
  ].join("\n");
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#FFF7F3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2B1B24">
<span style="display:none">${escapeHtml(k("preheader"))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:24px;padding:32px">
<tr><td style="font-size:28px;font-weight:800;color:#E6397E">gugu</td></tr>
<tr><td style="padding-top:16px;font-size:22px;font-weight:700">${escapeHtml(k("heading"))}</td></tr>
<tr><td style="padding-top:12px;font-size:16px;line-height:24px">${escapeHtml(k("body"))}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#E6397E;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px">${escapeHtml(k("button"))}</a></td></tr>
<tr><td style="padding-top:24px;font-size:14px;color:#6B5A63">${escapeHtml(k("codeIntro"))}</td></tr>
<tr><td style="padding-top:6px;font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(input.code)}</td></tr>
<tr><td style="padding-top:24px;font-size:13px;color:#6B5A63">${escapeHtml(k("ignore"))}</td></tr>
</table>
<p style="font-size:12px;color:#6B5A63">${escapeHtml(t("email:footer"))}</p>
</td></tr></table></body></html>`;
  return { to: input.to, subject, text, html };
}
