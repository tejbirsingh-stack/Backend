const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * Email Verification Template Builder
 */
function renderEmailVerificationHtml({ name, verificationUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">Verify Your Email Address</h2>
    <p>Hi ${name},</p>
    <p>Your account has been successfully registered. Please click the button below to verify your email address:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}" class="btn-primary">Verify Email</a>
    </div>
    <div style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
      Or copy and paste this link into your browser:<br/>
      <a href="${verificationUrl}" style="color: #818cf8; word-break: break-all;">${verificationUrl}</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">This verification link will expire in 24 hours. If you did not create an account, you can safely ignore this email.</p>
  `;
  return wrapEmailLayout({
    title: 'Verify Your Email - Noah Platform',
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

/**
 * Password Reset Template Builder
 */
function renderPasswordResetHtml({ name, resetUrl, orgLogoUrl = null, orgName = null }) {
  const displayName = name && typeof name === 'string' ? name.trim() : 'there';
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">Reset Your Password</h2>
    <p>Hi ${displayName},</p>
    <p>We received a request to reset the password for your Noah Cloud account. Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="btn-primary">Reset Password</a>
    </div>
    <div style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
      Or copy and paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color: #818cf8; word-break: break-all;">${resetUrl}</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">This password reset link is valid for <strong>12 hours</strong>.<br/>If you did not request a password reset, please ignore this email or contact support if you have security concerns.</p>
  `;
  return wrapEmailLayout({
    title: 'Reset Your Password - Noah Platform',
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

/**
 * MFA OTP Code Template Builder
 */
function renderMfaCodeHtml({ name, code, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">Authentication Required</h2>
    <p>Hi ${name},</p>
    <p>You are attempting to log in. Please use the following authentication code to complete your login:</p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="background-color: #0f172a; border: 1px solid #6366f1; color: #ffffff; padding: 18px 32px; border-radius: 10px; font-weight: bold; font-size: 28px; letter-spacing: 6px; display: inline-block;">
        ${code}
      </div>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">This security code will expire in 10 minutes.</p>
  `;
  return wrapEmailLayout({
    title: 'Authentication Code - Noah Platform',
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

module.exports = {
  renderEmailVerificationHtml,
  renderPasswordResetHtml,
  renderMfaCodeHtml,
};
