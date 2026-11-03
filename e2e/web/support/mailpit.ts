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

const LINK_RE = /https?:\/\/\S+\/auth\/verify\?token=[\w-]+/;

/**
 * Newest sign-in mail for `to` (it carries the verify link and the 6-digit code). Other mail to the
 * same address — e.g. a Zalo hand-off notification sent by the worker at the same moment — is
 * skipped, so a team notification can never be mistaken for the magic link.
 */
async function latestSignInMail(to: string, after: number): Promise<MailMessage> {
  let found: MailMessage | undefined;
  await expect
    .poll(
      async () => {
        const msgs = await waitForMail(to, { count: after + 1 });
        // Only mail that arrived after the `after` earlier ones (newest first).
        found = msgs.slice(0, Math.max(0, msgs.length - after)).find((m) => LINK_RE.test(m.Text));
        return found !== undefined;
      },
      { message: `no sign-in mail with a magic link to ${to}`, timeout: 20_000 },
    )
    .toBe(true);
  if (!found) throw new Error(`no magic link mail to ${to}`);
  return found;
}

/** Latest magic link for `to` (the link that lands on `/{locale}/auth/verify?token=…`). */
export async function latestMagicLink(to: string, after = 0): Promise<string> {
  const mail = await latestSignInMail(to, after);
  const link = LINK_RE.exec(mail.Text)?.[0];
  if (!link) throw new Error(`no magic link in latest sign-in mail to ${to}`);
  return link;
}

/** 6-digit sign-in code from the latest magic-link mail for `to` (typed on another device). */
export async function latestCode(to: string, after = 0): Promise<string> {
  const mail = await latestSignInMail(to, after);
  const code = /\b(\d{6})\b/.exec(mail.Text)?.[1];
  if (!code) throw new Error(`no 6-digit code in latest sign-in mail to ${to}`);
  return code;
}

/**
 * Asserts that `to` receives no email for `forMs` (polling). GuGu never emails a salon's
 * customers (X26): before X26 a confirmation reached Mailpit within a second or two, so a quiet
 * window this long catches a regression without slowing the suite much.
 */
export async function expectNoMail(to: string, forMs = 5_000): Promise<void> {
  const deadline = Date.now() + forMs;
  for (;;) {
    const got = await searchMail(`to:"${to}"`);
    expect(
      got.map((m) => m.Subject),
      `no email may reach ${to}`,
    ).toEqual([]);
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}
