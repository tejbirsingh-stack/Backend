/**
 * Base Email Layout Wrapper
 * Standardizes Header and Footer across all system emails.
 * Renders Organization Brand Logo Image + Organization Name side-by-side (matches App UI header exactly).
 */
function wrapEmailLayout({ title = 'Noah Platform', previewText = '', bodyHtml, orgLogoUrl = null, orgName = null }) {
  const currentYear = new Date().getFullYear();
  const displayName = orgName || 'NOAH Cloud';

  let logoUrl = orgLogoUrl;

  // Sanitize / fix the logoUrl
  if (logoUrl && (logoUrl.startsWith('cid:') || logoUrl.startsWith('data:'))) {
    // CID or Data URL inline attachment — use as-is!
  } else if (!logoUrl || typeof logoUrl !== 'string' || logoUrl.trim() === '' || logoUrl === 'null' || logoUrl === 'undefined') {
    // No logo provided — use Noah default logo URL
    logoUrl = 'https://qa.noahcloud.ai/noah-logo.png';
  } else if (logoUrl.startsWith('/')) {
    // Relative URL — make it absolute using the public base
    const baseUrl = process.env.WEBHOOK_HOST || process.env.APP_URL || 'https://qa.noahcloud.ai';
    logoUrl = `${baseUrl.replace(/\/$/, '')}${logoUrl}`;
  } else if (logoUrl.includes('localhost') || logoUrl.includes('127.0.0.1')) {
    // Local dev URL — try to swap with public base, else use fallback
    const publicBaseUrl = process.env.WEBHOOK_HOST || process.env.APP_URL || null;
    if (publicBaseUrl && !publicBaseUrl.includes('localhost')) {
      logoUrl = logoUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, publicBaseUrl.replace(/\/$/, ''));
    } else {
      logoUrl = 'https://qa.noahcloud.ai/noah-logo.png';
    }
  }

  return `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0;">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700" rel="stylesheet">
 
<style>
    /* Reset styles */
    body {
      font-family: 'Roboto', Arial, sans-serif;
      height: 100% !important;
      margin: 0;
      min-width: 100%;
      padding: 0;
      width: 100% !important;
      color: #111827;
      background-color: #ececec;
    }
    body, table, td, div, p, a {
      line-height: 140%;
      text-size-adjust: 100%;
      -webkit-font-smoothing: antialiased;
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
    }
    table, td {
      border-collapse: collapse !important;
      border-spacing: 0;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    #outlook a {padding: 0;}
    .ReadMsgBody {width: 100%;}
    .ExternalClass {width: 100%;}
    .ExternalClass,
    .ExternalClass p,
    .ExternalClass span,
    .ExternalClass font,
    .ExternalClass td,
    .ExternalClass div {line-height: 100%;}

    @media all and (min-width: 560px) {
      .container {
        border-radius: 8px;
        -webkit-border-radius: 8px;
        -moz-border-radius: 8px;
        -khtml-border-radius: 8px;
      }
    }
    a, a:hover {color: #6d28d9;}
    .footer a,
    .footer a:hover {
      color: #4b5563;
    }
    .btn-primary {
      background-color: #7c3aed;
      color: #ffffff !important;
      padding: 12px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      display: inline-block;
    }
    .card-box {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      color: #111827;
    }
  </style>
</head>
<body topmargin="0" rightmargin="0" bottommargin="0" leftmargin="0" marginwidth="0" marginheight="0" width="100%" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; width: 100%; height: 100%; -webkit-font-smoothing: antialiased; text-size-adjust: 100%; -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; line-height: 140%; background-color: #ececec; color: #111827;" bgcolor="#ececec" text="#111827">
<!-- WRAPPER TABLE -->
<table width="100%" align="center" border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0; width: 100%;">
  <tr>
    <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 0;" bgcolor="#ececec">
      <!-- WRAPPER -->
      <table border="0" cellpadding="0" cellspacing="0" align="center" bgcolor="#ffffff" width="560" style="border-collapse: collapse; border-spacing: 0; padding: 0; width: inherit; max-width: 560px; margin: 30px 0 0 0; background-color: #ffffff" class="container">
        <!-- BRANDING LOGO & ORG NAME HEADER (MATCHES APP UI HEADER EXACTLY) -->
        <tr>
          <td align="center" valign="middle" bgcolor="#0f172a" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 18px 24px; background-color: #0f172a; border-radius: 8px 8px 0 0;">
            <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; border-collapse: collapse; border-spacing: 0;">
              <tr>
                <td align="center" valign="middle" style="padding-right: 10px; border-collapse: collapse;">
                  <!--[if !vml]-->
                  <img border="0" vspace="0" hspace="0"
                    src="${logoUrl}"
                    alt="${displayName}"
                    width="36"
                    height="36"
                    style="display: block; width: 36px; height: 36px; max-width: 36px; max-height: 36px; object-fit: contain; vertical-align: middle; border: 0; outline: none;"
                  />
                  <!--[endif]-->
                  <!--[if vml]>
                  <v:image xmlns:v="urn:schemas-microsoft-com:vml" src="${logoUrl}" style="width:36px;height:36px;" />
                  <![endif]-->
                </td>
                <td align="left" valign="middle" style="border-collapse: collapse;">
                  <span style="font-family: 'Roboto', Arial, sans-serif; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px; line-height: 100%; display: inline-block; vertical-align: middle;">
                    ${displayName}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- MAIN TITLE -->
        <tr>
          <td align="center" valign="top" bgcolor="#f3e8ff" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 18px 20px; background-color: #f3e8ff; border-bottom: 2px solid #ddd6fe;">
            <h1 style="color: #4c1d95 !important; font-family: 'Roboto', Arial, sans-serif; font-size: 18px; font-weight: 700; margin: 0; text-transform: capitalize; text-align: center;">${title}</h1>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 24px 6.25%; width: 87.5%; color: #111827; background-color: #ffffff;">
            ${bodyHtml}
          </td>
        </tr>
      </table>
      <!-- FOOTER -->
      <table border="0" cellpadding="0" cellspacing="0" align="center" width="560" style="border-collapse: collapse; border-spacing: 0; padding: 0; width: inherit; max-width: 560px;" class="wrapper">
        <tr>
          <td align="center" valign="top" style="border-collapse: collapse; border-spacing: 0; margin: 0; padding: 20px; font-size: 12px; font-weight: 500; line-height: 150%; color: #4b5563; font-family: 'Roboto', Arial, sans-serif;" class="footer">
              Copyright &copy; ${currentYear} ${displayName}. All Rights Reserved.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
  `.trim();
}

module.exports = { wrapEmailLayout };
