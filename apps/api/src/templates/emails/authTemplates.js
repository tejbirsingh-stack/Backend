const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * Email Verification Template Builder
 */
function renderEmailVerificationHtml({ name, verificationUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">Verify Your Email Address</h2>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">Hi ${name},</p>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">Your account has been successfully registered. Please click the button below to verify your email address:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}" class="btn-primary">Verify Email</a>
    </div>
    <div style="font-size: 13px; color: #4b5563; margin-top: 24px;">
      Or copy and paste this link into your browser:<br/>
      <a href="${verificationUrl}" style="color: #7c3aed; word-break: break-all;">${verificationUrl}</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 13px; color: #4b5563; font-weight: 500; margin: 0; text-align: center;">This verification link will expire in 24 hours. If you did not create an account, you can safely ignore this email.</p>
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
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">Reset Your Password</h2>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">Hi ${displayName},</p>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">We received a request to reset the password for your Noah Cloud account. Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="btn-primary">Reset Password</a>
    </div>
    <div style="font-size: 13px; color: #4b5563; margin-top: 24px;">
      Or copy and paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color: #7c3aed; word-break: break-all;">${resetUrl}</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 13px; color: #4b5563; font-weight: 500; margin: 0; text-align: center;">This password reset link is valid for <strong>12 hours</strong>.<br/>If you did not request a password reset, please ignore this email or contact support if you have security concerns.</p>
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
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">Authentication Required</h2>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">Hi ${name},</p>
    <p style="font-size: 15px; color: #111827; font-family: 'Roboto', Arial, sans-serif;">You are attempting to log in. Please use the following authentication code to complete your login:</p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="background-color: #f5f3ff; border: 2px solid #7c3aed; color: #6d28d9; padding: 18px 32px; border-radius: 10px; font-weight: bold; font-size: 32px; letter-spacing: 8px; display: inline-block;">
        ${code}
      </div>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 13px; color: #4b5563; font-weight: 500; margin: 0; text-align: center;">This security code will expire in 10 minutes.</p>
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
