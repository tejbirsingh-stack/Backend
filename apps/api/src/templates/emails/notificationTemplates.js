const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * New Comment Notification Template Builder
 */
function renderNewAnnotationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">New Comment on ${videoName}</h2>
    <p>Hi ${name},</p>
    <p><strong>${commenterName}</strong> just left a new comment on your team's video:</p>
    <div style="background-color: #0f172a; border-left: 4px solid #6366f1; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #f1f5f9;">
      "${commentText}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Video</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">You received this email because you are a member of the workspace associated with this video.</p>
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
    <h2 style="color: #818cf8; text-align: center; margin-top: 0; margin-bottom: 20px;">You Were Mentioned on ${videoName}</h2>
    <p>Hi ${name},</p>
    <p><strong>${commenterName}</strong> mentioned you in a comment on your team's video:</p>
    <div style="background-color: #0f172a; border-left: 4px solid #818cf8; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #f1f5f9;">
      "${commentText}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Mention</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #334155; margin: 28px 0;" />
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">You received this email because you were mentioned in a comment on Noah Platform.</p>
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
