// Reads emails from the local Mailpit (docker-compose `mailpit`, API on MAILPIT_UI_PORT).
const base = `http://127.0.0.1:${process.env["MAILPIT_UI_PORT"] ?? "18025"}/api/v1`;

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export interface ReceivedMail {
  subject: string;
  text: string;
  html: string;
}

/** Waits for the newest email to `to` (polling, default 5 s). */
export async function waitForMail(to: string, timeoutMs = 5_000): Promise<ReceivedMail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as { messages: MailpitSummary[] };
    const latest = body.messages[0];
    if (latest) {
      const msg = (await (await fetch(`${base}/message/${latest.ID}`)).json()) as {
        Subject: string;
        Text: string;
        HTML: string;
      };
      return { subject: msg.Subject, text: msg.Text, html: msg.HTML };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no email to ${to} within ${String(timeoutMs)}ms`);
}

/** Magic-link token and 6-digit code from a GuGu sign-in email. */
export function extractMagicLink(mail: ReceivedMail): { token: string; code: string; url: string } {
  const url = /https?:\/\/\S+\/auth\/verify\?token=[\w-]+/.exec(mail.text)?.[0];
  const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
  if (!url || !code) throw new Error("magic link or code not found in email");
  return { url, token: new URL(url).searchParams.get("token") ?? "", code };
}

export async function countMailsTo(to: string): Promise<number> {
  const res = await fetch(`${base}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages_count: number }).messages_count;
}
