const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * New Comment Notification Template Builder
 */
function renderNewAnnotationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">New Comment on ${videoName}</h2>
    <p style="font-size: 15px; color: #333333;">Hi ${name},</p>
    <p style="font-size: 15px; color: #333333;"><strong>${commenterName}</strong> just left a new comment on your team's video:</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #1e293b;">
      "${commentText}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Video</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0;">You received this email because you are a member of the workspace associated with this video.</p>
  `;
  return wrapEmailLayout({
    title: `New comment on ${videoName} - Noah Platform`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

/**
 * Mention Notification Template Builder
 */
function renderMentionNotificationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">You Were Mentioned on ${videoName}</h2>
    <p style="font-size: 15px; color: #333333;">Hi ${name},</p>
    <p style="font-size: 15px; color: #333333;"><strong>${commenterName}</strong> mentioned you in a comment on your team's video:</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #1e293b;">
      "${commentText}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Mention</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0;">You received this email because you were mentioned in a comment on Noah Platform.</p>
  `;
  return wrapEmailLayout({
    title: `You were mentioned on ${videoName} - Noah Platform`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

module.exports = {
  renderNewAnnotationHtml,
  renderMentionNotificationHtml,
};
