/**
 * Email domains for the email-only signup's abuse brakes (ADR-0018). Disposable (throwaway) inbox
 * providers may not create salons; large consumer providers are exempt from the per-domain throttle.
 * Keep the lists small and maintained here; subdomains of a listed domain match too.
 */
export const DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxbear.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailpoof.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempmail.dev",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
];

export const MAJOR_EMAIL_PROVIDERS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.vn",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
];

/** Lower-cased domain part of an email ("" when there is none). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0
    ? ""
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

const matches = (domain: string, list: readonly string[]) =>
  list.some((d) => domain === d || domain.endsWith(`.${d}`));

export const isDisposableEmail = (email: string): boolean =>
  matches(emailDomain(email), DISPOSABLE_EMAIL_DOMAINS);

export const isMajorEmailProvider = (email: string): boolean =>
  matches(emailDomain(email), MAJOR_EMAIL_PROVIDERS);
