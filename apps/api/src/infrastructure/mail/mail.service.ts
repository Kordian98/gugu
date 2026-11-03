import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { AppConfig } from "../config/app-config";

export interface MailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Display name shown as the sender (e.g. the salon); the address stays MAIL_FROM's. */
  fromName?: string;
  replyTo?: string | null;
  attachments?: MailAttachment[];
  /** Deterministic Message-ID (without brackets) so a retried send is recognisable downstream. */
  messageId?: string;
  headers?: Record<string, string>;
}

/** `GuGu <no-reply@gugu.local>` → `no-reply@gugu.local`. */
export function mailAddressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

/**
 * SMTP transport. Locally this is Mailpit (UI http://localhost:18025); production uses the
 * provider chosen by topic 13 behind the same interface. Never logs addresses or bodies.
 * Notification emails go through the notifications module's queue (topic 11); auth emails
 * (magic links) are sent directly by the auth module.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    this.transport = createTransport(config.env.SMTP_URL);
  }

  async send(mail: OutgoingMail): Promise<{ messageId: string | null }> {
    const { fromName, replyTo, messageId, attachments, headers, ...rest } = mail;
    const from = fromName
      ? { name: fromName, address: mailAddressOf(this.config.env.MAIL_FROM) }
      : this.config.env.MAIL_FROM;
    const info = (await this.transport.sendMail({
      from,
      ...rest,
      ...(replyTo ? { replyTo } : {}),
      ...(messageId ? { messageId: `<${messageId}>` } : {}),
      ...(attachments?.length ? { attachments } : {}),
      ...(headers ? { headers } : {}),
    })) as { messageId?: string };
    this.logger.log({ subjectLength: mail.subject.length }, "mail sent");
    return { messageId: info.messageId ?? null };
  }
}
