/**
 * Brevo Transactional Email Provider
 * Strictly used ONLY for password-reset and recovery as specified in requirements.
 * Normal sign-in, login, browsing, posting, liking, and following must NOT send emails.
 */

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  providerStatus?: number;
}

export class BrevoEmailProvider {
  private apiKey?: string;
  private senderEmail: string;
  private senderName: string;

  constructor(env?: any) {
    const e = env || (typeof process !== 'undefined' ? process.env : {});
    this.apiKey = e?.BREVO_API_KEY;
    this.senderEmail = e?.BREVO_SENDER_EMAIL || 'noreply@sphere-social.app';
    const rawSenderName = e?.BREVO_SENDER_NAME?.trim();
    this.senderName = rawSenderName
      ? rawSenderName.charAt(0).toUpperCase() + rawSenderName.slice(1)
      : 'Sphere';
  }

  isConfigured(): boolean {
    if (!this.apiKey) return false;
    const clean = this.apiKey.trim();
    return clean.length > 0;
  }

  /**
   * Send Password Reset Email via Brevo REST API v3
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
        error: 'Brevo email provider is not configured. Provide BREVO_API_KEY in server environment to dispatch live emails.',
      };
    }

    const payload = {
      sender: {
        name: this.senderName,
        email: this.senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject: 'Reset your Sphere password',
      htmlContent: `
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
            <p><a href="${resetLink}" class="button">Reset Password</a></p>
            <p>This password reset link will expire in 1 hour and can only be used once.</p>
            <p class="footer">If you didn't request this password reset, you can safely ignore this email. Your account remains secure.</p>
          </div>
        </body>
        </html>
      `,
    };

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey!.trim(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        let errorMsg = data?.message || `Brevo HTTP error ${response.status}`;
        if (response.status === 401 || errorMsg.toLowerCase().includes('key not found')) {
          const isSmtpStyleKey = this.apiKey && !this.apiKey.startsWith('xkeysib-');
          errorMsg = `Brevo authentication failed (401 Unauthorized: Key not found). ${
            isSmtpStyleKey
              ? `The configured key starts with '${this.apiKey!.slice(0, 6)}...', which is an SMTP password. Brevo transactional REST API requires an API key v3 starting with 'xkeysib-'. In Brevo, go to SMTP & API -> 'API Keys' tab and click 'Generate a new API key'.`
              : `Please verify that your API key is active and generated from Brevo Dashboard -> SMTP & API -> API Keys.`
          }`;
        } else if (response.status === 400 && errorMsg.toLowerCase().includes('sender')) {
          errorMsg = `Brevo sender error: '${this.senderEmail}' must be verified under Senders & IP -> Senders in your Brevo account.`;
        }
        console.warn(`[Brevo Dispatch Warning]: ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
          providerStatus: response.status,
        };
      }

      return {
        success: true,
        messageId: data?.messageId,
        providerStatus: response.status,
      };
    } catch (err: any) {
      console.warn('[Brevo Dispatch Exception]:', err.message);
      return {
        success: false,
        error: err.message || 'Failed to dispatch email via Brevo',
      };
    }
  }
}

export function getEmailProvider(env?: any): BrevoEmailProvider {
  return new BrevoEmailProvider(env);
}
