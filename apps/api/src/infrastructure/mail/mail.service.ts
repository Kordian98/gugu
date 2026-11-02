import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { AppConfig } from "../config/app-config";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * SMTP transport. Locally this is Mailpit (UI http://localhost:18025); production uses the
 * provider chosen by topic 13 behind the same interface. Never logs addresses or bodies.
 * TODO(11): route through the notifications outbox/BullMQ once that module exists.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    this.transport = createTransport(config.env.SMTP_URL);
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.transport.sendMail({ from: this.config.env.MAIL_FROM, ...mail });
    this.logger.log({ subjectLength: mail.subject.length }, "mail sent");
  }
}
