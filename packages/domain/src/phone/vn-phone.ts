/**
 * Vietnamese mobile/landline normalisation to E.164 (`+84…`). Deliberately small until a
 * libphonenumber dependency is justified (spec 05 G15). Accepts `0912 345 678`, `+84 912345678`,
 * `84912345678`, with spaces, dots or dashes. Returns null for anything that is not a plausible
 * Vietnamese number.
 */
export function normalizeVnPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.\-()]/g, "");
  let national: string | null = null;
  if (/^\+84\d+$/.test(compact)) national = compact.slice(3);
  else if (/^84\d{9}$/.test(compact)) national = compact.slice(2);
  else if (/^0\d+$/.test(compact)) national = compact.slice(1);
  // Mobile: 9 national digits (3/5/7/8/9…); landline: 10 digits starting with 2 (02x area codes).
  if (!national || !/^(?:[35789]\d{8}|2\d{9})$/.test(national)) return null;
  return `+84${national}`;
}

/** Marker in masked phone numbers; the app hides call/copy actions when it is present. */
export const PHONE_MASK = "•";

/**
 * Masked display for members without `customers.phone.read` (owner may revoke it, q24): country
 * code and last 3 digits only, e.g. `+84 ••• ••• 678`. Never reversible.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const cc = e164.startsWith("+84") ? "+84" : "+";
  return `${cc} ${PHONE_MASK.repeat(3)} ${PHONE_MASK.repeat(3)} ${digits.slice(-3)}`;
}
