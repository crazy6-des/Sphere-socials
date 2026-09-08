/**
 * Brevo Transactional Email Provider
 * Strictly used ONLY for password-reset and recovery.
 * Supports Brevo SMTP relay (smtp-relay.brevo.com:587) via nodemailer
 * with fallback to Brevo REST API v3 when REST API key is provided.
 */

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  providerStatus?: number;
}

export class BrevoEmailProvider {
  private smtpHost: string;
  private smtpPort: number;
  private smtpUser: string;
  private smtpPass: string;
  private apiKey?: string;
  private senderEmail: string;
  private senderName: string;

  constructor(env?: any) {
    const e = env || (typeof process !== 'undefined' ? process.env : {});
    this.smtpHost = e?.BREVO_SMTP_SERVER || 'smtp-relay.brevo.com';
    this.smtpPort = Number(e?.BREVO_SMTP_PORT || 587);
    this.smtpUser = e?.BREVO_SMTP_LOGIN || 'b81f5c001@smtp-brevo.com';
    this.smtpPass = e?.BREVO_SMTP_KEY || e?.BREVO_API_KEY || 'bskxluWzaBthfO0';
    this.apiKey = e?.BREVO_API_KEY;
    this.senderEmail = e?.BREVO_SENDER_EMAIL || 'growthmedia70@gmail.com';
    const rawSenderName = e?.BREVO_SENDER_NAME?.trim();
    this.senderName = rawSenderName
      ? rawSenderName.charAt(0).toUpperCase() + rawSenderName.slice(1)
      : 'Sphere';
  }

  isConfigured(): boolean {
    return Boolean(this.smtpUser && this.smtpPass);
  }

  /**
   * Send Password Reset Email via Brevo SMTP (or REST API v3)
   */
  async sendPasswordResetEmail(
    toEmail: string,
    toName: string,
    resetToken: string,
    resetUrlBase?: string
  ): Promise<EmailSendResult> {
    const frontendBase = resetUrlBase || 'http://localhost:3000';
    const resetLink = `${frontendBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    if (!this.isConfigured()) {
      console.info(`[Password Reset Dev Notice]: Generated token reset link: ${resetLink}`);
      return {
        success: false,
        error: 'Brevo SMTP credentials are not configured.',
      };
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 24px; }
          .container { max-width: 480px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px; }
          .logo { font-size: 24px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 24px; }
          .button { display: inline-block; background-color: #ffffff; color: #000000; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
          .footer { font-size: 12px; color: #71717a; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">SPHERE</div>
          <h2>Password Reset Request</h2>
          <p>Hello ${toName || 'there'},</p>
          <p>We received a request to reset your Sphere account password. Click the button below to set a new password:</p>
          <p><a href="${resetLink}" class="button" style="color: #000000 !important; background-color: #ffffff !important;">Reset Password</a></p>
          <p>Or paste this link into your browser:</p>
          <p style="word-break: break-all; font-size: 11px; color: #a1a1aa;">${resetLink}</p>
          <p style="font-size: 12px; color: #71717a; margin-top: 20px;">This password reset link will expire in 1 hour and can only be used once.</p>
          <p class="footer">If you didn't request this password reset, you can safely ignore this email. Your account remains secure.</p>
        </div>
      </body>
      </html>
    `;

    // 1. Try Brevo SMTP via nodemailer
    try {
      const nodemailerModule = await import('nodemailer');
      const nodemailer = nodemailerModule.default || nodemailerModule;

      const transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: false, // Port 587 uses STARTTLS
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: `"${this.senderName}" <${this.senderEmail}>`,
        to: toEmail,
        subject: 'Reset your Sphere password',
        text: `Hello ${toName || 'there'},\n\nClick the link below to reset your Sphere password:\n${resetLink}\n\nThis link will expire in 1 hour.`,
        html: htmlContent,
      });

      console.info(`[Brevo SMTP Dispatch Success]: Sent to ${toEmail}, MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
        providerStatus: 200,
      };
    } catch (smtpErr: any) {
      console.warn('[Brevo SMTP Dispatch Failed, attempting REST fallback if available]:', smtpErr.message);

      // 2. If REST API key starting with xkeysib- is available, attempt REST fallback
      if (this.apiKey && this.apiKey.startsWith('xkeysib-')) {
        try {
          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': this.apiKey.trim(),
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({
              sender: {
                name: this.senderName,
                email: this.senderEmail,
              },
              to: [{ email: toEmail, name: toName || toEmail }],
              subject: 'Reset your Sphere password',
              htmlContent,
            }),
          });

          const data: any = await response.json().catch(() => ({}));
          if (response.ok) {
            return {
              success: true,
              messageId: data?.messageId,
              providerStatus: response.status,
            };
          }
        } catch (restErr: any) {
          console.warn('[Brevo REST Fallback Error]:', restErr.message);
        }
      }

      return {
        success: false,
        error: `Brevo SMTP delivery error: ${smtpErr.message}`,
      };
    }
  }
}

export function getEmailProvider(env?: any): BrevoEmailProvider {
  return new BrevoEmailProvider(env);
}
