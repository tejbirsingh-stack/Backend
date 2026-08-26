const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * Secure Share Invite Template Builder
 */
function renderShareInviteHtml({ assetTitle, shareUrl, expiresAt, permissions, hasPassword, password, senderName, orgLogoUrl = null, orgName = null }) {
  const allowedActions = [];
  if (permissions?.view) allowedActions.push('View');
  if (permissions?.comment) allowedActions.push('Comment & Annotate');
  if (permissions?.download || permissions?.downloadProxy) allowedActions.push('Download');
  const actionsText = allowedActions.join(', ') || 'View';

  const formattedExpiry = expiresAt ? new Date(expiresAt).toLocaleString() : 'N/A';

  const passwordNoteHtml = password
    ? `<div style="background-color: #fefce8; border: 1px solid #fef08a; color: #854d0e; padding: 14px 16px; border-radius: 8px; margin: 20px 0; font-size: 14px;">
         <div style="margin-bottom: 6px;">🔒 <strong>Access Password:</strong></div>
         <div style="font-family: monospace; font-size: 16px; font-weight: bold; background-color: #fef08a; padding: 6px 12px; border-radius: 6px; color: #713f12; letter-spacing: 1px; display: inline-block;">
           ${password}
         </div>
       </div>`
    : hasPassword
      ? `<div style="background-color: #fefce8; border: 1px solid #fef08a; color: #854d0e; padding: 12px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
         🔒 <strong>Password Protected:</strong> The owner has protected this link with a password. Please ask the sender directly for the password.
       </div>`
      : '';

  const bodyHtml = `
    <p style="font-size: 15px; font-weight: 400; line-height: 160%; color: #333333; font-family: 'Roboto', Arial, sans-serif;">Hi,</p>
    <p style="font-size: 15px; font-weight: 400; line-height: 160%; color: #333333; font-family: 'Roboto', Arial, sans-serif;"><strong>${senderName || 'A teammate'}</strong> has shared <strong>"${assetTitle || 'a media file'}"</strong> with you for review.</p>

    <div class="card-box" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-bottom: 6px;">Allowed Permissions</div>
      <div style="font-size: 14px; color: #0f172a; font-weight: 600;">${actionsText}</div>
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-top: 14px; margin-bottom: 4px;">Expires At</div>
      <div style="font-size: 14px; color: #0f172a; font-weight: 500;">${formattedExpiry}</div>
    </div>

    ${passwordNoteHtml}

    <div style="text-align: center; margin: 32px 0;">
      <a href="${shareUrl}" class="btn-primary">Open Shared Media</a>
    </div>

    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0; text-align: center;">You received this invite because an asset was shared with your email on Noah Platform.</p>
  `;
  return wrapEmailLayout({
    title: `${senderName || 'Someone'} shared "${assetTitle || 'a file'}" with you`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

/**
 * Project Guest Invite Template Builder
 */
function renderProjectGuestInviteHtml({ projectName, organizationName, appUrl, orgLogoUrl = null }) {
  const orgName = organizationName || 'An organization';
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">Project Shared With You</h2>
    <p>Hi,</p>
    <p><strong>${projectName}</strong> (${orgName}) has shared a project with you. Please log in to view it in your <strong>Shared with me</strong> section.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${appUrl}" class="btn-primary">Login to View</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">You received this invite because your email was invited to a project on Noah Platform.</p>
  `;
  return wrapEmailLayout({
    title: `${orgName} shared project "${projectName}" with you`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

/**
 * Project Member Invite Template Builder
 */
function renderProjectMemberInviteHtml({ projectName, inviterName, appUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">You've Been Added to a Project</h2>
    <p>Hi,</p>
    <p><strong>${inviterName || 'A team member'}</strong> has added you to the project <strong>"${projectName}"</strong> on Noah Platform.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${appUrl}" class="btn-primary">View Project</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">Log in to your Noah account to access this project.</p>
  `;
  return wrapEmailLayout({
    title: `${inviterName || 'Someone'} added you to project "${projectName}"`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

module.exports = {
  renderShareInviteHtml,
  renderProjectGuestInviteHtml,
  renderProjectMemberInviteHtml,
};
