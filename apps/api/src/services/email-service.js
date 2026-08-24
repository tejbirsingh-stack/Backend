const sgMail = require("@sendgrid/mail");
const {
  renderEmailVerificationHtml,
  renderPasswordResetHtml,
  renderMfaCodeHtml,
} = require("../templates/emails/authTemplates");
const {
  renderNewAnnotationHtml,
  renderMentionNotificationHtml,
} = require("../templates/emails/notificationTemplates");
const {
  renderShareInviteHtml,
  renderProjectGuestInviteHtml,
  renderProjectMemberInviteHtml,
} = require("../templates/emails/shareTemplates");

class EmailService {
  constructor() {
    const apiKey = this.apiKey;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      console.warn("⚠️ SENDGRID_API_KEY is not set at startup. Emails will fall back to console logging unless set later.");
    }
  }

  get apiKey() {
    const raw = process.env.SENDGRID_API_KEY;
    return raw ? raw.replace(/^["']|["']$/g, "").trim() : null;
  }

  get fromEmail() {
    const raw = process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || "noreply@noah-dev.local";
    return raw.replace(/^["']|["']$/g, "").trim();
  }

  get fromName() {
    const raw = process.env.SMTP_FROM_NAME || "Noah Platform";
    return raw.replace(/^["']|["']$/g, "").trim();
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
      console.log("✉️ [Email Service (Mock) - No API Key Found]");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${text}`);
      return true;
    }

    sgMail.setApiKey(apiKey);

    console.log(`\n================= ✉️ SENDGRID EMAIL DEBUG =================`);
    console.log(`Sending To     : ${to}`);
    console.log(`Sending From   : "${this.fromName}" <${this.fromEmail}>`);
    console.log(`Subject        : ${subject}`);
    console.log(`API Key Prefix : ${apiKey.substring(0, 10)}... (${apiKey.length} characters)`);
    console.log(`===========================================================\n`);

    try {
      const [response] = await sgMail.send(msg);
      console.log(`✅ SendGrid Response Status : ${response.statusCode} (${response.statusCode === 202 ? "Accepted by SendGrid" : "OK"})`);
      console.log(`✅ SendGrid Message ID      : ${response.headers["x-message-id"] || "N/A"}`);
      console.log(`✉️ Email successfully sent via SendGrid to ${to}\n`);
      return true;
    } catch (error) {
      console.error(`\n❌ ================== SENDGRID ERROR ================== ❌`);
      console.error(`Error Message : ${error.message || error}`);
      if (error.response && error.response.body) {
        console.error(`HTTP Status   : ${error.code || error.response.statusCode}`);
        console.error(`Error Details :`, JSON.stringify(error.response.body, null, 2));
      } else {
        console.error(`Full Error    :`, error);
      }
      console.error(`❌ ==================================================== ❌\n`);
      return false;
    }
  }

  // Send email verification link
  async sendEmailVerification(to, name, verificationUrl, { orgLogoUrl, orgName } = {}) {
    const subject = "Verify Your Noah Account Email";
    const text = `Hi ${name},\n\nYour account has been successfully registered. Please click the link below to verify your email address:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you did not create an account, please ignore this email.`;
    const html = renderEmailVerificationHtml({ name, verificationUrl, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send password reset template
  async sendPasswordReset(to, name, resetUrl, { orgLogoUrl, orgName } = {}) {
    const displayName = name && typeof name === "string" ? name.trim() : "there";
    const subject = "Reset Your Password";
    const text = `Hi ${displayName},\n\nYou requested to reset your password for your Noah Cloud account. Please click the link below to set a new password:\n\n${resetUrl}\n\nThis password reset link will expire in 12 hours.\n\nIf you did not request a password reset, please ignore this email or contact support if you have concerns.`;
    const html = renderPasswordResetHtml({ name, resetUrl, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send MFA OTP Code
  async sendMfaCode(to, name, code, { orgLogoUrl, orgName } = {}) {
    const subject = "Your Authentication Code";
    const text = `Hi ${name},\n\nYour authentication code is: ${code}\n\nThis code will expire in 10 minutes.`;
    const html = renderMfaCodeHtml({ name, code, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send New Annotation/Comment Notification
  async sendNewAnnotationEmail(to, name, commenterName, videoName, commentText, videoUrl, { orgLogoUrl, orgName } = {}) {
    const subject = `New comment on video: ${videoName}`;
    const text = `Hi ${name},\n\n${commenterName} just left a new comment on the video "${videoName}":\n\n"${commentText}"\n\nView the video here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = renderNewAnnotationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Mention Notification
  async sendMentionNotificationEmail(to, name, commenterName, videoName, commentText, videoUrl, { orgLogoUrl, orgName } = {}) {
    const subject = `You were mentioned in a comment on: ${videoName}`;
    const text = `Hi ${name},\n\n${commenterName} mentioned you in a comment on the video "${videoName}":\n\n"${commentText}"\n\nView the video here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = renderMentionNotificationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Secure Share Invite to External Recipient
  async sendShareInvite(to, { assetTitle, shareUrl, expiresAt, permissions, hasPassword, password, senderName, orgLogoUrl, orgName }) {
    const subject = `${senderName || 'Someone'} shared "${assetTitle || 'a file'}" with you on Noah`;
    
    const allowedActions = [];
    if (permissions?.view) allowedActions.push('View');
    if (permissions?.comment) allowedActions.push('Comment & Annotate');
    if (permissions?.download || permissions?.downloadProxy) allowedActions.push('Download');
    const actionsText = allowedActions.join(', ') || 'View';

    const formattedExpiry = expiresAt ? new Date(expiresAt).toLocaleString() : 'N/A';

    const passwordNoteText = password
      ? `\n\nAccess Password: ${password}`
      : hasPassword
      ? '\n\nNote: This share link is protected with a password. Please contact the sender to get the password.'
      : '';

    const text = `Hi,\n\n${senderName || 'Someone'} has shared "${assetTitle || 'a file'}" with you on Noah Platform.\n\nAllowed Actions: ${actionsText}\nExpires At: ${formattedExpiry}${passwordNoteText}\n\nAccess link: ${shareUrl}\n\nThanks,\nNoah Platform`;

    const html = renderShareInviteHtml({
      assetTitle,
      shareUrl,
      expiresAt,
      permissions,
      hasPassword,
      password,
      senderName,
      orgLogoUrl,
      orgName,
    });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Project Guest Invite (standard login required)
  async sendProjectGuestInvite(to, { projectName, organizationName, appUrl, orgLogoUrl }) {
    const orgName = organizationName || 'An organization';
    const subject = `${orgName} shared project "${projectName}" with you`;
    const text = `Hi,\n\n${projectName}, ${orgName} has shared a project with you. Please login and view in your Shared with me option.\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = renderProjectGuestInviteHtml({ projectName, organizationName, appUrl, orgLogoUrl });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Project Member Invite (org member — directs to login + project)
  async sendProjectMemberInvite(to, { projectName, inviterName, appUrl, orgLogoUrl, orgName }) {
    const subject = `${inviterName || 'Someone'} added you to project "${projectName}" on Noah`;
    const text = `Hi,\n\n${inviterName || 'A team member'} has added you to the project "${projectName}" on Noah. Log in to access it:\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = renderProjectMemberInviteHtml({ projectName, inviterName, appUrl, orgLogoUrl, orgName });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Workspace Guest Invite (standard login required)
  async sendWorkspaceGuestInvite(to, { workspaceName, organizationName, appUrl }) {
    const orgName = organizationName || 'An organization';
    const subject = `${orgName} shared workspace "${workspaceName}" with you`;
    const text = `Hi,\n\n${workspaceName}, ${orgName} has shared a workspace with you. Please login and view in your Shared with me option.\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">Workspace Shared With You</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          <strong>${workspaceName}</strong>, ${orgName} has shared a workspace with you. Please login and view in your <strong>Shared with me</strong> option.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">Login to View</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">You received this invite because your email was shared with a workspace on Noah Platform.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Workspace Member Invite (org member — directs to login + workspace)
  async sendWorkspaceMemberInvite(to, { workspaceName, inviterName, appUrl }) {
    const subject = `${inviterName || 'Someone'} added you to workspace "${workspaceName}" on Noah`;
    const text = `Hi,\n\n${inviterName || 'A team member'} has added you to the workspace "${workspaceName}" on Noah. Log in to access it:\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">You've Been Added to a Workspace</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          <strong>${inviterName || 'A team member'}</strong> has added you to the workspace
          <strong>"${workspaceName}"</strong> on Noah Platform.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">View Workspace</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Log in to your Noah account to access this workspace.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }
}

module.exports = new EmailService();
