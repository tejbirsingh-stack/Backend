/**
 * Base Email Layout Wrapper
 * Standardizes Header and Footer across all system emails.
 * Supports Organization Branding Logo with fallback to Noah Cloud logo.
 */
function wrapEmailLayout({ title = 'Noah Platform', previewText = '', bodyHtml, orgLogoUrl = null, orgName = null }) {
  const currentYear = new Date().getFullYear();
  const displayName = orgName || 'Noah Platform';

  // Dynamic Header: Organization custom logo if available, else Noah Cloud header
  const headerHtml = orgLogoUrl
    ? `<img src="${orgLogoUrl}" alt="${displayName}" style="max-height: 48px; max-width: 220px; object-fit: contain; display: inline-block;" />`
    : `<h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #818cf8; letter-spacing: 0.5px;">NOAH CLOUD</h1>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      margin: 0;
      padding: 24px 12px;
      color: #f8fafc;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #1e293b;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #334155;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .email-header {
      background-color: #0f172a;
      padding: 28px 24px;
      text-align: center;
      border-bottom: 1px solid #334155;
    }
    .email-body {
      padding: 32px 28px;
      color: #e2e8f0;
      line-height: 1.6;
      font-size: 15px;
    }
    .email-footer {
      background-color: #0f172a;
      padding: 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #334155;
      line-height: 1.5;
    }
    .email-footer a {
      color: #818cf8;
      text-decoration: none;
    }
    .email-footer a:hover {
      text-decoration: underline;
    }
    .btn-primary {
      background-color: #4f46e5;
      color: #ffffff !important;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      display: inline-block;
      transition: background-color 0.2s ease;
    }
    .card-box {
      background-color: #0f172a;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 16px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- DYNAMIC HEADER WITH ORG LOGO OR NOAH LOGO -->
    <div class="email-header">
      ${headerHtml}
    </div>

    <!-- DYNAMIC BODY CONTENT -->
    <div class="email-body">
      ${bodyHtml}
    </div>

    <!-- COMMON FOOTER -->
    <div class="email-footer">
      <p style="margin: 0 0 8px 0;">© ${currentYear} ${displayName}. All rights reserved.</p>
      <p style="margin: 0;">
        <a href="https://noah-cloud.com/privacy">Privacy Policy</a> &nbsp;•&nbsp; 
        <a href="https://noah-cloud.com/terms">Terms of Service</a> &nbsp;•&nbsp; 
        <a href="https://noah-cloud.com/support">Support</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

module.exports = { wrapEmailLayout };
