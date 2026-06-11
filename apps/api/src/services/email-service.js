const sgMail = require("@sendgrid/mail");

class EmailService {
  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      console.warn("⚠️ SENDGRID_API_KEY is not set at startup. Emails will fall back to console logging unless set later.");
    }
  }

  get apiKey() {
    return process.env.SENDGRID_API_KEY;
  }

  get fromEmail() {
    return process.env.SMTP_FROM_EMAIL || "noreply@noah-dev.local";
  }

  get fromName() {
    return process.env.SMTP_FROM_NAME || "Noah Platform";
  }

  /**
   * Send a general email
   */
  async sendEmail({ to, subject, text, html }) {
    const apiKey = this.apiKey;
    const msg = {
      to,
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      subject,
      text,
      html,
    };

    if (!apiKey) {
      console.log("✉️ [Email Service (Mock)]");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${text}`);
      return true;
    }

    sgMail.setApiKey(apiKey);

    try {
      await sgMail.send(msg);
      console.log(`✉️ Email successfully sent via SendGrid to ${to}`);
      return true;
    } catch (error) {
      console.error("❌ SendGrid email sending failed:", error);
      if (error.response) {
        console.error("SendGrid API Response:", error.response.body);
      }
      return false;
    }
  }

  /**
   * Send password reset template
   */
  async sendPasswordReset(to, name, resetUrl) {
    const subject = "Reset Your Noah Password";
    const text = `Hi ${name},\n\nYou requested to reset your password. Please use the following link to reset it:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Reset Your Password</h2>
        <p>Hi ${name},</p>
        <p>You requested to reset your password for your Noah account. Click the button below to choose a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">This link will expire in 1 hour. If you did not make this request, you can safely ignore this email.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, text, html });
  }
}

module.exports = new EmailService();
