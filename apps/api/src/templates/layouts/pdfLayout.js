/**
 * Base PDF Layout Wrapper
 * Standardizes A4 page sizing, print-ready CSS headers, footers, and page numbers across all system PDFs.
 * Supports Organization Branding Logo with fallback to Noah Cloud logo.
 */
function wrapPdfLayout({ title = 'Document Report', bodyHtml, orgLogoUrl = null, orgName = null, accentColor = '#4f46e5' }) {
  const currentYear = new Date().getFullYear();
  const displayName = orgName || 'Noah Platform';

  const pdfHeaderLogo = orgLogoUrl
    ? `<img src="${orgLogoUrl}" alt="${displayName}" style="max-height: 44px; max-width: 200px; object-fit: contain;" />`
    : `<h2 style="margin: 0; color: ${accentColor}; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">NOAH CLOUD</h2>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 15mm 18mm 15mm;
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: Helvetica, Arial, sans-serif;
        font-size: 9pt;
        color: #64748b;
      }
    }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      font-size: 10pt;
    }
    .pdf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .pdf-title-container {
      text-align: right;
    }
    .pdf-document-title {
      font-size: 14pt;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
    }
    .pdf-document-subtitle {
      font-size: 9pt;
      color: #64748b;
      margin-top: 2px;
    }
    .pdf-body {
      margin-bottom: 30px;
    }
    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 8pt;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background-color: #f8fafc;
      color: #475569;
      font-weight: 600;
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <!-- DYNAMIC PDF HEADER -->
  <div class="pdf-header">
    <div class="pdf-logo">
      ${pdfHeaderLogo}
    </div>
    <div class="pdf-title-container">
      <div class="pdf-document-title">${title}</div>
      <div class="pdf-document-subtitle">${displayName}</div>
    </div>
  </div>

  <!-- DYNAMIC PDF BODY -->
  <div class="pdf-body">
    ${bodyHtml}
  </div>

  <!-- DYNAMIC PDF FOOTER -->
  <div class="pdf-footer">
    <div>© ${currentYear} ${displayName}. All rights reserved.</div>
    <div>Confidential Document</div>
  </div>
</body>
</html>
  `.trim();
}

module.exports = { wrapPdfLayout };
