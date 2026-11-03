import { createHash } from "node:crypto";

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * Canonical form of an email address for abuse caps: lower-case, `+tag` removed, and for Gmail
 * dots in the local part dropped and googlemail.com mapped to gmail.com. `a.b+x@GoogleMail.com`
 * and `ab@gmail.com` are the same mailbox and must share one quota.
 */
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/** Stored on the delivery instead of the address (the send log keeps no personal data in clear). */
export const recipientKey = (email: string): string =>
  createHash("sha256")
    .update(`notify-recipient|${canonicalEmail(email)}`)
    .digest("hex");
