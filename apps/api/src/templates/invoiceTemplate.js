const { wrapPdfLayout } = require('./layouts/pdfLayout');

/**
 * Generates clean, professional HTML for an Invoice incorporating Organization Branding
 * @param {Object} invoiceData Dynamic invoice fields from Stripe
 * @param {Object} branding Org branding settings (logoUrl, headerImageUrl, accentColor, accountName)
 * @returns {string} Complete HTML string ready for PDF rendering
 */
function generateInvoiceHtml(invoiceData = {}, branding = {}) {
  const accentColor = branding.accentColor || '#4f46e5';
  const orgName = branding.accountName || invoiceData.companyName || 'Noah Cloud';
  const orgLogoUrl = branding.logoUrl || null;
  const headerImageUrl = branding.headerImageUrl || null;

  const invoiceNumber = invoiceData.invoiceNumber || 'INV-00000';
  const issueDate = invoiceData.issueDate || '—';
  const dueDate = invoiceData.dueDate || '—';
  const customerName = invoiceData.customerName || invoiceData.companyName || 'Valued Customer';
  const customerEmail = invoiceData.customerEmail || '';
  const billingAddress = invoiceData.billingAddress || '';
  
  const status = (invoiceData.status || 'Paid').toUpperCase();
  const statusBg = status === 'PAID' ? '#dcfce7' : status === 'OPEN' ? '#fef3c7' : '#f1f5f9';
  const statusColor = status === 'PAID' ? '#15803d' : status === 'OPEN' ? '#b45309' : '#475569';

  const currencyCode = (invoiceData.currency || 'USD').toUpperCase();

  const lines = invoiceData.lines && invoiceData.lines.length > 0
    ? invoiceData.lines
    : [
        {
          description: invoiceData.description || 'Subscription Plan',
          quantity: invoiceData.quantity || 1,
          unitPrice: invoiceData.unitPrice || invoiceData.total || '$0.00',
          amount: invoiceData.amount || invoiceData.total || '$0.00',
        }
      ];

  const lineItemsHtml = lines.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-weight: 600; color: #1e293b; font-size: 10pt;">${item.description}</div>
        ${item.period ? `<div style="font-size: 8.5pt; color: #64748b; margin-top: 2px;">${item.period}</div>` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155; font-size: 10pt;">
        ${item.quantity || 1}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155; font-size: 10pt;">
        ${item.unitPrice}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #0f172a; font-size: 10pt;">
        ${item.amount}
      </td>
    </tr>
  `).join('');

  const bodyHtml = `
    ${headerImageUrl ? `
      <div style="margin-bottom: 20px; border-radius: 8px; overflow: hidden; max-height: 120px;">
        <img src="${headerImageUrl}" alt="Header" style="width: 100%; object-fit: cover; max-height: 120px;" />
      </div>
    ` : ''}

    <!-- INVOICE HEADER ROW -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px;">
      <div>
        <h1 style="margin: 0; font-size: 24pt; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">INVOICE</h1>
        <div style="margin-top: 6px; font-size: 10pt; color: #475569; font-weight: 500;">
          <span style="color: #64748b;">Invoice Number:</span> <strong style="color: #0f172a;">${invoiceNumber}</strong>
        </div>
        <div style="margin-top: 2px; font-size: 9.5pt; color: #475569;">
          <span style="color: #64748b;">Date of Issue:</span> ${issueDate}
        </div>
        <div style="margin-top: 2px; font-size: 9.5pt; color: #475569;">
          <span style="color: #64748b;">Date Due:</span> ${dueDate}
        </div>
      </div>

      <div style="text-align: right;">
        <span style="display: inline-block; padding: 6px 14px; background-color: ${statusBg}; color: ${statusColor}; border-radius: 20px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          ${status}
        </span>
        <div style="margin-top: 14px; font-size: 18pt; font-weight: 800; color: ${accentColor};">
          ${invoiceData.amountDue || invoiceData.total || '$0.00'} <span style="font-size: 10pt; font-weight: 600; color: #64748b;">${currencyCode}</span>
        </div>
        <div style="font-size: 8.5pt; color: #64748b; margin-top: 2px;">Amount Due</div>
      </div>
    </div>

    <!-- BILLING DETAILS BOX -->
    <div style="display: flex; gap: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 28px;">
      <div style="flex: 1;">
        <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: ${accentColor}; letter-spacing: 0.5px; margin-bottom: 6px;">Billed From</div>
        <div style="font-size: 10pt; font-weight: 700; color: #0f172a;">${orgName}</div>
        <div style="font-size: 9pt; color: #475569; margin-top: 2px;">Noah Media Asset Management Platform</div>
      </div>

      <div style="flex: 1;">
        <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: ${accentColor}; letter-spacing: 0.5px; margin-bottom: 6px;">Bill To</div>
        <div style="font-size: 10pt; font-weight: 700; color: #0f172a;">${customerName}</div>
        ${customerEmail ? `<div style="font-size: 9pt; color: #475569; margin-top: 2px;">${customerEmail}</div>` : ''}
        ${billingAddress ? `<div style="font-size: 9pt; color: #64748b; margin-top: 4px; line-height: 1.4;">${billingAddress}</div>` : ''}
      </div>
    </div>

    <!-- LINE ITEMS TABLE -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 10px 12px; text-align: left; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">Description</th>
          <th style="padding: 10px 12px; text-align: center; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; width: 60px;">Qty</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; width: 100px;">Unit Price</th>
          <th style="padding: 10px 12px; text-align: right; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; width: 110px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- SUMMARY TOTALS -->
    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
      <div style="width: 260px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 9.5pt; color: #475569;">
          <span>Subtotal</span>
          <span style="font-weight: 600; color: #0f172a;">${invoiceData.subtotal || invoiceData.total || '$0.00'}</span>
        </div>
        ${invoiceData.tax ? `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 9.5pt; color: #475569;">
            <span>Tax</span>
            <span style="font-weight: 600; color: #0f172a;">${invoiceData.tax}</span>
          </div>
        ` : ''}
        ${invoiceData.discount ? `
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 9.5pt; color: #16a34a;">
            <span>Discount</span>
            <span style="font-weight: 600;">-${invoiceData.discount}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #e2e8f0; font-size: 11pt; font-weight: 800; color: #0f172a; margin-top: 4px;">
          <span>Total</span>
          <span>${invoiceData.total || '$0.00'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 12px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 10pt; font-weight: 700; color: ${accentColor}; margin-top: 6px;">
          <span>Amount Due</span>
          <span>${invoiceData.amountDue || invoiceData.total || '$0.00'} ${currencyCode}</span>
        </div>
      </div>
    </div>

    <!-- FOOTER NOTE -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 8.5pt; color: #64748b; text-align: center;">
      Thank you for your business! If you have any questions regarding this invoice, please contact support.
    </div>
  `;

  return wrapPdfLayout({
    title: `Invoice ${invoiceNumber}`,
    bodyHtml,
    orgLogoUrl,
    orgName,
    accentColor,
  });
}

module.exports = { generateInvoiceHtml };
