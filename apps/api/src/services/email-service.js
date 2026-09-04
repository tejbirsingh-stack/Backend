const sgMail = require("@sendgrid/mail");
const { getSendgridConfig } = require("./sendgridConfig");
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
    // Credentials are resolved dynamically from AWS Secrets Manager on demand
  }

  /**
   * Send a general email — clean HTML message with transactional headers
   */
  async sendEmail({ to, subject, text, html }) {
    const { apiKey, fromEmail, fromName } = await getSendgridConfig();

    // Transactional Reference ID to guarantee Inbox delivery in Gmail
    const txnId = Math.floor(1000 + Math.random() * 9000);
    const finalSubject = subject.includes("[") ? subject : `[INV-${txnId}] ${subject}`;

    const msg = {
      to,
      from: {
        email: fromEmail,
        name: fromName,
      },
      subject: finalSubject,
      text,
      html,
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        "Importance": "High",
        "X-Mailer": "Noah Platform Transactional System",
        "X-Entity-Ref-ID": `TXN-${txnId}-${Date.now()}`,
      },
    };

    if (!apiKey) {
      console.log("✉️ [Email Service (Mock) - No API Key Found]");
      console.log(`To: ${to}`);
      console.log(`Subject: ${finalSubject}`);
      console.log(`Body: ${text}`);
      return true;
    }

    sgMail.setApiKey(apiKey);

    console.log(`\n================= ✉️ SENDGRID EMAIL DEBUG =================`);
    console.log(`Sending To     : ${to}`);
    console.log(`Sending From   : "${fromName}" <${fromEmail}>`);
    console.log(`Subject        : ${finalSubject}`);
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

  // Send password reset email
  async sendPasswordReset(to, name, resetUrl, { orgLogoUrl, orgName } = {}) {
    const subject = "Reset Your Noah Account Password";
    const text = `Hi ${name},\n\nWe received a request to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`;
    const html = renderPasswordResetHtml({ name, resetUrl, orgLogoUrl, orgName });
    return this.sendEmail({ to, subject, text, html });
  }

  // Send MFA code email
  async sendMfaCode(to, name, otpCode, { orgLogoUrl, orgName } = {}) {
    const subject = "Your Noah Login Verification Code";
    const text = `Hi ${name},\n\nYour verification code is: ${otpCode}\n\nThis code will expire in 10 minutes. If you did not attempt to log in, please secure your account immediately.`;
    const html = renderMfaCodeHtml({ name, code: otpCode, otpCode, orgLogoUrl, orgName });
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Share Invite (Media asset review link)
  async sendShareInvite(to, { assetTitle, shareUrl, expiresAt, permissions, hasPassword, password, senderName, orgLogoUrl, orgName }) {
    const subject = `${senderName || "Someone"} shared "${assetTitle || "a file"}" with you on Noah`;
    const allowedActions = [];
    if (permissions?.view) allowedActions.push("View");
    if (permissions?.comment) allowedActions.push("Comment & Annotate");
    if (permissions?.download || permissions?.downloadProxy) allowedActions.push("Download");
    const actionsText = allowedActions.join(", ") || "View";
    const formattedExpiry = expiresAt ? new Date(expiresAt).toLocaleString() : "N/A";
    const passwordNoteText = password
      ? `\n\nAccess Password: ${password}`
      : hasPassword
      ? "\n\nNote: This share link is protected with a password. Please contact the sender to get the password."
      : "";

    const text = `Hi,\n\n${senderName || "Someone"} has shared "${assetTitle || "a file"}" with you on Noah Platform.\n\nAllowed Actions: ${actionsText}\nExpires At: ${formattedExpiry}${passwordNoteText}\n\nAccess link: ${shareUrl}\n\nThanks,\nNoah Platform`;

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
    const orgName = organizationName || "An organization";
    const subject = `${orgName} shared project "${projectName}" with you`;
    const text = `Hi,\n\n${projectName}, ${orgName} has shared a project with you. Please login and view in your Shared with me option.\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = renderProjectGuestInviteHtml({ projectName, organizationName, appUrl, orgLogoUrl });

    return this.sendEmail({ to, subject, text, html });
  }

  // Send Project Member Invite (org member)
  async sendProjectMemberInvite(to, { projectName, inviterName, appUrl, orgLogoUrl, orgName }) {
    const subject = `${inviterName || "Someone"} added you to project "${projectName}" on Noah`;
    const text = `Hi,\n\n${inviterName || "A team member"} has added you to the project "${projectName}" on Noah. Log in to access it:\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = renderProjectMemberInviteHtml({ projectName, inviterName, appUrl, orgLogoUrl });

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

  // Send Organization Invite
  async sendOrganizationInvite(to, { appUrl }) {
    const subject = `You have been invited to create an organization on Noah`;
    const text = `Hi,\n\nYou have been invited to create a new organization on Noah Platform. Log in or sign up to access it:\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">Create Your Organization</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          You have been invited to create a new organization on Noah Platform.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">Accept Invitation</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Sign up to your Noah account to get started.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Role Update Notification
  async sendRoleUpdateNotification(to, { userName, oldRole, newRole }) {
    const subject = `Your role on Noah has been updated to ${newRole}`;
    const text = `Hi ${userName || 'User'},\n\nYour account role has been updated from "${oldRole || 'Previous Role'}" to "${newRole}".\n\nThanks,\nNoah Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">Role Updated</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi ${userName || 'there'},</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          Your account role on Noah has been updated to <strong>${newRole}</strong>.
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Noah Platform</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Mention Notification Email
  async sendMentionNotificationEmail(to, name, commenterName, videoName, commentText, videoUrl, { orgLogoUrl, orgName } = {}) {
    const subject = `${commenterName} mentioned you on Noah`;
    const text = `Hi ${name},\n\n${commenterName} mentioned you in a comment on "${videoName}":\n\n"${commentText}"\n\nView it here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = renderMentionNotificationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl, orgName });
    return this.sendEmail({ to, subject, text, html });
  }

  // Send New Annotation Email
  async sendNewAnnotationEmail(to, name, commenterName, videoName, commentText, videoUrl, { orgLogoUrl, orgName } = {}) {
    const subject = `New comment on ${videoName}`;
    const text = `Hi ${name},\n\n${commenterName} left a comment on "${videoName}":\n\n"${commentText}"\n\nView it here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = renderNewAnnotationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl, orgName });
    return this.sendEmail({ to, subject, text, html });
  }
}

module.exports = new EmailService();

