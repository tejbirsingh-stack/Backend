const PDFDocument = require('pdfkit');

/**
 * Generates a clean custom PDF binary buffer for an invoice matching Stripe data + Org Branding
 * @param {Object} invoiceData Dynamic invoice data mapped from Stripe
 * @param {Object} branding Org branding details (logoUrl, accountName, accentColor)
 * @returns {Promise<Buffer>} PDF file buffer
 */
function buildCustomInvoicePdf(invoiceData = {}, branding = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const primaryColor = branding.accentColor || '#4f46e5';
      const orgName = branding.accountName || invoiceData.companyName || 'Noah Cloud';
      
      const invoiceNumber = invoiceData.invoiceNumber || 'INV-00000';
      const issueDate = invoiceData.issueDate || '—';
      const dueDate = invoiceData.dueDate || '—';
      const customerName = invoiceData.customerName || invoiceData.companyName || 'Valued Customer';
      const customerEmail = invoiceData.customerEmail || '';
      const billingAddress = invoiceData.billingAddress || '';
      const status = (invoiceData.status || 'Paid').toUpperCase();
      const currencyCode = (invoiceData.currency || 'USD').toUpperCase();

      // Top Accent Line
      doc.rect(0, 0, 595.28, 8).fill(primaryColor);

      // Header Branding
      let topY = 35;
      doc.fillColor(primaryColor).fontSize(20).font('Helvetica-Bold').text(orgName.toUpperCase(), 40, topY);
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text('Noah Media Asset Management Platform', 40, topY + 24);

      // Invoice Title & Status Badge (Right aligned)
      doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text('INVOICE', 400, topY, { align: 'right' });
      doc.fontSize(9).font('Helvetica-Bold').fillColor(status === 'PAID' ? '#15803d' : '#b45309')
         .text(`STATUS: ${status}`, 400, topY + 26, { align: 'right' });

      // Horizontal Divider
      let cursorY = topY + 55;
      doc.moveTo(40, cursorY).lineTo(555, cursorY).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // Invoice Info Meta Grid
      cursorY += 15;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text('Invoice Number:', 40, cursorY);
      doc.font('Helvetica').fillColor('#0f172a').text(invoiceNumber, 130, cursorY);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Issue Date:', 40, cursorY + 16);
      doc.font('Helvetica').fillColor('#0f172a').text(issueDate, 130, cursorY + 16);

      doc.font('Helvetica-Bold').fillColor('#475569').text('Due Date:', 40, cursorY + 32);
      doc.font('Helvetica').fillColor('#0f172a').text(dueDate, 130, cursorY + 32);

      // Amount Due Summary (Right Side Box)
      const boxTop = cursorY;
      doc.roundedRect(380, boxTop, 175, 48, 6).fill('#f8fafc').stroke('#e2e8f0');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text('AMOUNT DUE', 392, boxTop + 10);
      doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text(`${invoiceData.amountDue || invoiceData.total || '$0.00'} ${currencyCode}`, 392, boxTop + 24);

      // Billed From / Bill To Section
      cursorY += 65;
      doc.roundedRect(40, cursorY, 245, 75, 6).fill('#f8fafc').stroke('#e2e8f0');
      doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor).text('BILLED FROM', 52, cursorY + 10);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(orgName, 52, cursorY + 24);
      doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text('Noah Media Asset Management Platform', 52, cursorY + 38);

      doc.roundedRect(310, cursorY, 245, 75, 6).fill('#f8fafc').stroke('#e2e8f0');
      doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor).text('BILL TO', 322, cursorY + 10);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(customerName, 322, cursorY + 24);
      if (customerEmail) {
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(customerEmail, 322, cursorY + 38);
      }
      if (billingAddress) {
        doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(billingAddress.slice(0, 45), 322, cursorY + 50);
      }

      // Line Items Table Header
      cursorY += 95;
      doc.rect(40, cursorY, 515, 22).fill('#f1f5f9');
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569');
      doc.text('DESCRIPTION', 50, cursorY + 6);
      doc.text('QTY', 330, cursorY + 6, { width: 40, align: 'center' });
      doc.text('UNIT PRICE', 380, cursorY + 6, { width: 70, align: 'right' });
      doc.text('AMOUNT', 460, cursorY + 6, { width: 85, align: 'right' });

      // Line Items Rows
      cursorY += 22;
      const lines = invoiceData.lines && invoiceData.lines.length > 0
        ? invoiceData.lines
        : [{
            description: invoiceData.description || 'Subscription Plan',
            quantity: invoiceData.quantity || 1,
            unitPrice: invoiceData.unitPrice || invoiceData.total || '$0.00',
            amount: invoiceData.amount || invoiceData.total || '$0.00',
          }];

      lines.forEach((item) => {
        cursorY += 12;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text(item.description, 50, cursorY);
        if (item.period) {
          doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(item.period, 50, cursorY + 12);
        }

        doc.fontSize(9).font('Helvetica').fillColor('#334155');
        doc.text(String(item.quantity || 1), 330, cursorY, { width: 40, align: 'center' });
        doc.text(String(item.unitPrice), 380, cursorY, { width: 70, align: 'right' });
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a');
        doc.text(String(item.amount), 460, cursorY, { width: 85, align: 'right' });

        cursorY += item.period ? 26 : 18;
        doc.moveTo(40, cursorY).lineTo(555, cursorY).strokeColor('#f1f5f9').lineWidth(1).stroke();
      });

      // Totals Section
      cursorY += 15;
      const totalsX = 360;

      doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Subtotal:', totalsX, cursorY);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(invoiceData.subtotal || invoiceData.total || '$0.00', totalsX + 90, cursorY, { align: 'right', width: 105 });

      if (invoiceData.tax) {
        cursorY += 16;
        doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Tax:', totalsX, cursorY);
        doc.font('Helvetica-Bold').fillColor('#0f172a').text(invoiceData.tax, totalsX + 90, cursorY, { align: 'right', width: 105 });
      }

      if (invoiceData.discount) {
        cursorY += 16;
        doc.fontSize(9).font('Helvetica').fillColor('#475569').text('Discount:', totalsX, cursorY);
        doc.font('Helvetica-Bold').fillColor('#16a34a').text(`-${invoiceData.discount}`, totalsX + 90, cursorY, { align: 'right', width: 105 });
      }

      cursorY += 20;
      doc.moveTo(totalsX, cursorY).lineTo(555, cursorY).strokeColor('#cbd5e1').lineWidth(1).stroke();
      cursorY += 8;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Total:', totalsX, cursorY);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(invoiceData.total || '$0.00', totalsX + 90, cursorY, { align: 'right', width: 105 });

      // Footer Note
      doc.fontSize(8.5).font('Helvetica').fillColor('#94a3b8')
         .text('Thank you for upgrading your subscription! For any billing questions, contact support.', 40, 780, { align: 'center', width: 515 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildCustomInvoicePdf };
