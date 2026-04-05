import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailTransportConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromEmail?: string;
  fromName?: string;
}

@Injectable()
export class MailService {
  private createTransport(config?: MailTransportConfig) {
    const host = config?.host ?? process.env.SMTP_HOST;
    const port = Number(config?.port ?? process.env.SMTP_PORT) || 465;
    const secure =
      typeof config?.secure === 'boolean' ? config.secure : port === 465;
    const user = config?.user ?? process.env.SMTP_USER;
    const pass = config?.pass ?? process.env.SMTP_PASS;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth:
        user || pass
          ? {
              user,
              pass,
            }
          : undefined,
    });
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    transportConfig?: MailTransportConfig,
  ) {
    const transporter = this.createTransport(transportConfig);
    const fromEmail =
      transportConfig?.fromEmail ||
      transportConfig?.user ||
      process.env.SMTP_USER;
    const fromName = transportConfig?.fromName || 'No Reply';

    return transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });
  }
}
