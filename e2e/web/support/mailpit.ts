// Mailpit API helpers (http://localhost:18025). Mailpit is shared with dev, so every E2E address is
// under MAIL_DOMAIN and lookups are always by recipient.
import { expect } from "@playwright/test";
import { MAILPIT, MAIL_DOMAIN } from "./env";

export interface MailSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Created: string;
}
export interface MailMessage extends MailSummary {
  Text: string;
  HTML: string;
}

const api = `${MAILPIT}/api/v1`;

export async function searchMail(query: string): Promise<MailSummary[]> {
  const res = await fetch(`${api}/search?limit=200&query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Mailpit search ${query} → ${String(res.status)}`);
  return ((await res.json()) as { messages: MailSummary[] | null }).messages ?? [];
}

export async function readMail(id: string): Promise<MailMessage> {
  const res = await fetch(`${api}/message/${id}`);
  if (!res.ok) throw new Error(`Mailpit message ${id} → ${String(res.status)}`);
  return (await res.json()) as MailMessage;
}

/** Deletes every message sent to the E2E domain (never dev mail). */
export async function clearE2eMail(): Promise<void> {
  const res = await fetch(`${api}/search?query=${encodeURIComponent(`to:${MAIL_DOMAIN}`)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Mailpit cleanup → ${String(res.status)}`);
}

/**
 * Waits (web-first, via expect.poll) until `to` has at least `count` messages whose subject matches,
 * newest first. Failure message names the recipient and the subjects that did arrive.
 */
export async function waitForMail(
  to: string,
  opts: { subject?: RegExp; count?: number; timeout?: number } = {},
): Promise<MailMessage[]> {
  const count = opts.count ?? 1;
  let seen: MailSummary[] = [];
  await expect
    .poll(
      async () => {
        const all = await searchMail(`to:"${to}"`);
        seen = all;
        return all.filter((m) => !opts.subject || opts.subject.test(m.Subject)).length;
      },
      {
        message: `expected ≥${String(count)} mail(s) to ${to}${opts.subject ? ` matching ${String(opts.subject)}` : ""}; got subjects: ${JSON.stringify(seen.map((m) => m.Subject))}`,
        timeout: opts.timeout ?? 20_000,
      },
    )
    .toBeGreaterThanOrEqual(count);
  const matching = seen.filter((m) => !opts.subject || opts.subject.test(m.Subject));
  return Promise.all(matching.map((m) => readMail(m.ID)));
}

/** Latest magic link for `to` (the link that lands on `/{locale}/auth/verify?token=…`). */
export async function latestMagicLink(to: string, after = 0): Promise<string> {
  const msgs = await waitForMail(to, { count: after + 1 });
  const latest = msgs[0];
  const link = latest
    ? /https?:\/\/\S+\/auth\/verify\?token=[\w-]+/.exec(latest.Text)?.[0]
    : undefined;
  if (!link) throw new Error(`no magic link in latest mail to ${to}: ${latest?.Subject ?? "none"}`);
  return link;
}
