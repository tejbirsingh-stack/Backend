const sgMail = require("@sendgrid/mail");

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
  async sendEmailVerification(to, name, verificationUrl) {
    const subject = "Verify Your Noah Account Email";
    const text = `Hi ${name},\n\nYour account has been successfully registered. Please click the link below to verify your email address:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you did not create an account, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Verify Your Email Address</h2>
        <p>Hi ${name},</p>
        <p>Your account has been successfully registered. Please click the link below to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">This verification link will expire in 24 hours. If you did not create an account, you can safely ignore this email.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, text, html });
  }

  // Send password reset template
  async sendPasswordReset(to, name, resetUrl) {
    const displayName = name && typeof name === "string" ? name.trim() : "there";
    const subject = "Reset Your Password";
    const text = `Hi ${displayName},\n\nYou requested to reset your password for your Noah Cloud account. Please click the link below to set a new password:\n\n${resetUrl}\n\nThis password reset link will expire in 12 hours.\n\nIf you did not request a password reset, please ignore this email or contact support if you have concerns.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; text-align: center; margin-bottom: 24px;">Reset Your Password</h2>
        <p style="font-size: 15px; color: #1e293b;">Hi ${displayName},</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">We received a request to reset the password for your Noah Cloud account. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Or copy and paste this link into your browser:<br/><a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
        <p style="font-size: 12px; color: #64748b; line-height: 1.4;">This password reset link is valid for <strong>12 hours</strong>.<br/>If you did not request a password reset, please ignore this email or contact support if you have security concerns.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, text, html });
  }

  // Send MFA OTP Code
  async sendMfaCode(to, name, code) {
    const subject = "Your Authentication Code";
    const text = `Hi ${name},\n\nYour authentication code is: ${code}\n\nThis code will expire in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Authentication Required</h2>
        <p>Hi ${name},</p>
        <p>You are attempting to log in. Please use the following authentication code to complete your login:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="background-color: #f1f5f9; color: #0f172a; padding: 16px 24px; border-radius: 6px; font-weight: bold; font-size: 24px; letter-spacing: 4px; display: inline-block;">
            ${code}
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">This code will expire in 10 minutes.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send New Annotation/Comment Notification
  async sendNewAnnotationEmail(to, name, commenterName, videoName, commentText, videoUrl) {
    const subject = `New comment on video: ${videoName}`;
    const text = `Hi ${name},\n\n${commenterName} just left a new comment on the video "${videoName}":\n\n"${commentText}"\n\nView the video here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">New Comment on ${videoName}</h2>
        <p>Hi ${name},</p>
        <p><strong>${commenterName}</strong> just left a new comment on your team's video.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0; font-style: italic;">
          "${commentText}"
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${videoUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Video</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">You received this email because you are a member of the organization associated with this video.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Mention Notification
  async sendMentionNotificationEmail(to, name, commenterName, videoName, commentText, videoUrl) {
    const subject = `You were mentioned in a comment on: ${videoName}`;
    const text = `Hi ${name},\n\n${commenterName} mentioned you in a comment on the video "${videoName}":\n\n"${commentText}"\n\nView the video here: ${videoUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">You Were Mentioned on ${videoName}</h2>
        <p>Hi ${name},</p>
        <p><strong>${commenterName}</strong> mentioned you in a comment on your team's video.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0; font-style: italic;">
          "${commentText}"
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${videoUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Video</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b;">You received this email because you were mentioned in a comment on Noah Platform.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Secure Share Invite to External Recipient
  async sendShareInvite(to, { assetTitle, shareUrl, expiresAt, permissions, hasPassword, password, senderName }) {
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

    const passwordNoteHtml = password
      ? `<div style="background-color: #fefce8; border: 1px solid #fef08a; color: #854d0e; padding: 14px 16px; border-radius: 8px; margin: 20px 0; font-size: 14px;">
           <div style="margin-bottom: 6px;">🔒 <strong>Access Password:</strong></div>
           <div style="font-family: monospace; font-size: 16px; font-weight: bold; background-color: #fef08a; padding: 6px 12px; border-radius: 6px; color: #713f12; letter-spacing: 1px; display: inline-block;">
             ${password}
           </div>
         </div>`
      : hasPassword
      ? `<div style="background-color: #fffbebfb; border: 1px solid #fef08a; color: #854d0e; padding: 12px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
           🔒 <strong>Password Protected:</strong> The owner has protected this link with a password. Please ask the sender directly for the password.
         </div>`
      : '';

    const text = `Hi,\n\n${senderName || 'Someone'} has shared "${assetTitle || 'a file'}" with you on Noah Platform.\n\nAllowed Actions: ${actionsText}\nExpires At: ${formattedExpiry}${passwordNoteText}\n\nAccess link: ${shareUrl}\n\nThanks,\nNoah Platform`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">Noah Secure Share</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          <strong>${senderName || 'A teammate'}</strong> has shared <strong>"${assetTitle || 'a media file'}"</strong> with you for review.
        </p>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-bottom: 8px;">Allowed Permissions</div>
          <div style="font-size: 14px; color: #0f172a; font-weight: 500;">${actionsText}</div>
          <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-top: 12px; margin-bottom: 4px;">Expires At</div>
          <div style="font-size: 14px; color: #0f172a;">${formattedExpiry}</div>
        </div>

        ${passwordNoteHtml}

        <div style="text-align: center; margin: 32px 0;">
          <a href="${shareUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">Open Shared Media</a>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">You received this invite because an asset was shared with your email on Noah Platform.</p>
      </div>
    `;

    return this.sendEmail({ to, subject, text, html });
  }
  // Send Project Guest Invite (standard login required)
  async sendProjectGuestInvite(to, { projectName, organizationName, appUrl }) {
    const orgName = organizationName || 'An organization';
    const subject = `${orgName} shared project "${projectName}" with you`;
    const text = `Hi,\n\n${projectName}, ${orgName} has shared a project with you. Please login and view in your Shared with me option.\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">Project Shared With You</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          <strong>${projectName}</strong>, ${orgName} has shared a project with you. Please login and view in your <strong>Shared with me</strong> option.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">Login to View</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">You received this invite because your email was shared with a project on Noah Platform.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }

  // Send Project Member Invite (org member — directs to login + project)
  async sendProjectMemberInvite(to, { projectName, inviterName, appUrl }) {
    const subject = `${inviterName || 'Someone'} added you to project "${projectName}" on Noah`;
    const text = `Hi,\n\n${inviterName || 'A team member'} has added you to the project "${projectName}" on Noah. Log in to access it:\n\n${appUrl}\n\nThanks,\nNoah Platform`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0;">You've Been Added to a Project</h2>
        </div>
        <p style="font-size: 15px; color: #1e293b;">Hi,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.5;">
          <strong>${inviterName || 'A team member'}</strong> has added you to the project
          <strong>"${projectName}"</strong> on Noah Platform.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 15px;">View Project</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">Log in to your Noah account to access this project.</p>
      </div>
    `;
    return this.sendEmail({ to, subject, text, html });
  }
}

module.exports = new EmailService();
