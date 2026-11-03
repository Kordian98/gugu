import { Injectable } from "@nestjs/common";
import { MailService } from "../../../infrastructure/mail/mail.service";

/**
 * Channel provider port (spec 11 R17). Domain services never call a provider directly: the send
 * worker hands a rendered message to the provider of the delivery's channel. Customer messages are
 * not sent here at all: `zalo_template` belongs to the `zalo` module (salon's own OA) and GuGu
 * never emails customers (X26). SMS stays a mock behind this port (X12) and is not wired.
 */
export interface ChannelProvider<M> {
  readonly channel: string;
  send(message: M): Promise<{ providerMessageId: string | null }>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName: string;
  /** Deterministic per delivery (idempotency key), so a retried send carries the same id. */
  messageId: string;
}

/** A provider refused the message for good (bad address, rejected content): don't retry. */
export class PermanentChannelError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Team email over the shared MailService (Mailpit locally; SES/other later, topic 13). */
@Injectable()
export class EmailChannel implements ChannelProvider<EmailMessage> {
  readonly channel = "email";

  constructor(private readonly mail: MailService) {}

  async send(m: EmailMessage): Promise<{ providerMessageId: string | null }> {
    try {
      const { messageId } = await this.mail.send({
        to: m.to,
        subject: m.subject,
        text: m.text,
        html: m.html,
        fromName: m.fromName,
        messageId: m.messageId,
        // RFC 3834: automated message — no out-of-office loops.
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
      });
      return { providerMessageId: messageId };
    } catch (error) {
      const code = (error as { responseCode?: number }).responseCode;
      // SMTP 5xx = permanent (unknown mailbox, rejected); everything else is retried.
      if (typeof code === "number" && code >= 500) {
        throw new PermanentChannelError(`smtp_${String(code)}`);
      }
      throw error;
    }
  }
}
