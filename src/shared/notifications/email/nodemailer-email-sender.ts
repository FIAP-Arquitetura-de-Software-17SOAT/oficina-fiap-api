import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import * as nodemailer from 'nodemailer';
import { EmailMessage, EmailSender } from './email-sender';

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

@Injectable()
export class NodemailerEmailSender extends EmailSender {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const settings = this.readSettings();
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.user
        ? { user: settings.user, pass: settings.password! }
        : undefined,
    });

    await transporter.sendMail({ from: settings.from, ...message });
  }

  private readSettings(): SmtpSettings {
    const host = this.required('SMTP_HOST');
    const portValue = this.required('SMTP_PORT');
    const secureValue = this.required('SMTP_SECURE');
    const from = this.required('MAIL_FROM');
    const port = Number(portValue);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be a valid port');
    }

    if (secureValue !== 'true' && secureValue !== 'false') {
      throw new Error('SMTP_SECURE must be either true or false');
    }

    const user = this.optional('SMTP_USER');
    const password = this.optional('SMTP_PASSWORD');

    if (Boolean(user) !== Boolean(password)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must both be provided');
    }

    if (!isEmail(this.emailAddress(from))) {
      throw new Error('MAIL_FROM must be a valid email address');
    }

    return {
      host,
      port,
      secure: secureValue === 'true',
      user,
      password,
      from,
    };
  }

  private required(key: string): string {
    const value = this.optional(key);

    if (!value) {
      throw new Error(`${key} is required`);
    }

    return value;
  }

  private optional(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();

    return value || undefined;
  }

  private emailAddress(from: string): string {
    const match = from.match(/<([^<>]+)>$/);

    return match?.[1] ?? from;
  }
}
