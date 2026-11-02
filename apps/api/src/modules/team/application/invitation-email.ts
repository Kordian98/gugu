import { createI18n } from "@gugu/localization";
import type { Locale } from "@gugu/contracts";
import type { OutgoingMail } from "../../../infrastructure/mail/mail.service";

/** Lilac Glow tokens (packages/design-system tokens.ts); the API may not import UI packages. */
const color = {
  canvas: "#FDFAF7",
  ink: "#221024",
  body: "#5E4659",
  lilac500: "#A98BEB",
  lilac700: "#7B5CCB",
  plum950: "#2A1426",
} as const;

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Localized staff invitation email (`email:teamInvitation`, vi/en). */
export function renderInvitationEmail(input: {
  locale: Locale;
  to: string;
  link: string;
  salonName: string;
}): OutgoingMail {
  const { t } = createI18n(input.locale);
  const k = (key: string) => t(`email:teamInvitation.${key}`, { salonName: input.salonName });
  const text = [
    k("heading"),
    "",
    k("body"),
    "",
    input.link,
    "",
    k("ignore"),
    "",
    t("email:footer"),
  ].join("\n");
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:${color.canvas};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${color.ink}">
<span style="display:none">${escapeHtml(k("preheader"))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:24px;padding:32px">
<tr><td style="font-size:28px;font-weight:800;color:${color.lilac700}">gugu</td></tr>
<tr><td style="padding-top:16px;font-size:22px;font-weight:700">${escapeHtml(k("heading"))}</td></tr>
<tr><td style="padding-top:12px;font-size:16px;line-height:24px">${escapeHtml(k("body"))}</td></tr>
<tr><td style="padding-top:24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:${color.lilac500};color:${color.plum950};text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px">${escapeHtml(k("button"))}</a></td></tr>
<tr><td style="padding-top:24px;font-size:13px;color:${color.body}">${escapeHtml(k("ignore"))}</td></tr>
</table>
<p style="font-size:12px;color:${color.body}">${escapeHtml(t("email:footer"))}</p>
</td></tr></table></body></html>`;
  return { to: input.to, subject: k("subject"), text, html };
}
