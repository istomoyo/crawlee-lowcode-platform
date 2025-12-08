// src/mail/mail.service.ts
import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,   // QQ邮箱 smtp.qq.com
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,                  // 465 为 true, 587 为 false
      auth: {
        user: process.env.SMTP_USER, // QQ邮箱
        pass: process.env.SMTP_PASS, // SMTP 授权码
      },
    });
  }

  async sendMail(to: string, subject: string, text: string, html?: string) {
    return this.transporter.sendMail({
      from: `"No Reply" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
  }
}
