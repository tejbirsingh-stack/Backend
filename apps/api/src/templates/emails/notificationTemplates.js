const { wrapEmailLayout } = require('../layouts/emailLayout');

/**
 * Helper function to escape HTML entities to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * New Comment Notification Template Builder
 */
function renderNewAnnotationHtml({ name, commenterName, videoName, commentText, videoUrl, orgLogoUrl = null, orgName = null }) {
  const bodyHtml = `
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">New Comment on ${escapeHtml(videoName)}</h2>
    <p style="font-size: 15px; color: #333333;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #333333;"><strong>${escapeHtml(commenterName)}</strong> just left a new comment on your team's video:</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #1e293b;">
      "${escapeHtml(commentText)}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Video</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0;">You received this email because you are a member of the workspace associated with this video.</p>
  `;
  return wrapEmailLayout({
    title: `New comment on ${escapeHtml(videoName)} - Noah Platform`,
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
    <h2 style="color: #6d28d9; text-align: center; margin-top: 0; margin-bottom: 20px;">You Were Mentioned on ${escapeHtml(videoName)}</h2>
    <p style="font-size: 15px; color: #333333;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #333333;"><strong>${escapeHtml(commenterName)}</strong> mentioned you in a comment on your team's video:</p>
    <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; margin: 24px 0; font-style: italic; color: #1e293b;">
      "${escapeHtml(commentText)}"
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${videoUrl}" class="btn-primary">View Mention</a>
    </div>
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 28px 0;" />
    <p style="font-size: 12px; color: #64748b; margin: 0;">You received this email because you were mentioned in a comment on Noah Platform.</p>
  `;
  return wrapEmailLayout({
    title: `You were mentioned on ${escapeHtml(videoName)} - Noah Platform`,
    bodyHtml,
    orgLogoUrl,
    orgName,
  });
}

module.exports = {
  renderNewAnnotationHtml,
  renderMentionNotificationHtml,
};
