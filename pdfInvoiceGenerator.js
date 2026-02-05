/**
 * PDF Invoice Generator
 * 
 * Generates professional, modern invoices with:
 * - Clean black/white design
 * - Professional layout
 * - Seller and buyer info boxes
 * - Product table with proper formatting
 * - Tax calculations (AAM - tax exempt)
 * - Branding elements
 */

const PDFDocument = require('pdfkit');

const INVOICE_CONFIG = {
  SELLER: {
    NAME: 'SENKISEM EV',
    REGISTRATION: '60502292',
    ADDRESS: '3600 Ózd Bolyki Tamás utca 15. A épület 1. emelet 5-6. ajtó',
    TAX_NUMBER: '91113654-1-25'
  },
  BRAND: {
    NAME: 'Senkisem',
    TAGLINE: 'Not a Brand; Message.'
  },
  COLORS: {
    BLACK: '#000000',
    DARK_GRAY: '#333333',
    MEDIUM_GRAY: '#666666',
    LIGHT_GRAY: '#999999',
    BORDER: '#E5E5E5',
    ACCENT: '#667eea',
    TABLE_HEADER_BG: '#F5F5F5'
  }
};

/**
 * Generate professional PDF invoice
 */
async function generateInvoicePDF(orderData, totalAmount, invoiceNumber) {
  return new Promise((resolve, reject) => {
    try {
      const { customerData, cart } = orderData;
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: `Invoice ${invoiceNumber}`,
          Author: INVOICE_CONFIG.BRAND.NAME,
          Subject: 'Invoice',
          Creator: INVOICE_CONFIG.BRAND.NAME
        }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // ============================================
      // HEADER SECTION
      // ============================================
      
      // Brand name (left)
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text(INVOICE_CONFIG.BRAND.NAME, 50, 50);
      
      // Brand tagline
      doc.fontSize(9)
         .font('Helvetica-Oblique')
         .fillColor(INVOICE_CONFIG.COLORS.LIGHT_GRAY)
         .text(INVOICE_CONFIG.BRAND.TAGLINE, 50, 80);
      
      // Invoice title (right)
      doc.fontSize(32)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text('INVOICE', 400, 50, { align: 'right' });
      
      // Top border line
      doc.moveTo(50, 110)
         .lineTo(545, 110)
         .strokeColor(INVOICE_CONFIG.COLORS.BLACK)
         .lineWidth(2)
         .stroke();
      
      // ============================================
      // INVOICE DETAILS BOX (Top Right)
      // ============================================
      
      let yPos = 130;
      
      // Invoice Number
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text('Invoice Number:', 350, yPos);
      
      doc.fontSize(11)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text(invoiceNumber, 350, yPos + 15);
      
      yPos += 45;
      
      // Issue Date
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text('Issue Date:', 350, yPos);
      
      const issueDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text(issueDate, 350, yPos + 15);
      
      yPos += 45;
      
      // Payment Method
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text('Payment Method:', 350, yPos);
      
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text('Bank Card', 350, yPos + 15);
      
      // ============================================
      // SELLER INFORMATION BOX (Left)
      // ============================================
      
      yPos = 130;
      
      // Seller box background
      doc.rect(50, yPos - 5, 280, 100)
         .fillColor('#FAFAFA')
         .fill();
      
      // Seller title
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text('SELLER', 60, yPos);
      
      yPos += 20;
      
      // Seller details
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text(INVOICE_CONFIG.SELLER.NAME, 60, yPos);
      
      yPos += 13;
      doc.text(`Registration: ${INVOICE_CONFIG.SELLER.REGISTRATION}`, 60, yPos);
      
      yPos += 13;
      doc.text(INVOICE_CONFIG.SELLER.ADDRESS, 60, yPos, { width: 260 });
      
      yPos += 26;
      doc.text(`Tax Number: ${INVOICE_CONFIG.SELLER.TAX_NUMBER}`, 60, yPos);
      
      // ============================================
      // BUYER INFORMATION BOX
      // ============================================
      
      yPos = 250;
      
      // Buyer box background
      doc.rect(50, yPos - 5, 495, 80)
         .fillColor('#FAFAFA')
         .fill();
      
      // Buyer title
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text('BUYER', 60, yPos);
      
      yPos += 20;
      
      // Buyer details
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text(customerData.fullName || 'N/A', 60, yPos);
      
      yPos += 13;
      const buyerAddress = `${customerData.address || ''}, ${customerData.zip || ''} ${customerData.city || ''}, ${customerData.country || ''}`.trim();
      doc.text(buyerAddress, 60, yPos, { width: 475 });
      
      if (customerData.email) {
        yPos += 13;
        doc.text(`Email: ${customerData.email}`, 60, yPos);
      }
      
      if (customerData.phone) {
        yPos += 13;
        doc.text(`Phone: ${customerData.phone}`, 60, yPos);
      }
      
      // ============================================
      // PRODUCTS TABLE
      // ============================================
      
      yPos = 360;
      
      // Table header background
      doc.rect(50, yPos, 495, 25)
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .fill();
      
      // Table headers
      doc.fontSize(9)
         .font('Helvetica-Bold')
         .fillColor('#FFFFFF')
         .text('ITEM', 60, yPos + 8)
         .text('QTY', 320, yPos + 8, { width: 40, align: 'center' })
         .text('UNIT PRICE', 370, yPos + 8, { width: 70, align: 'right' })
         .text('VAT', 450, yPos + 8, { width: 40, align: 'center' })
         .text('TOTAL', 495, yPos + 8, { width: 50, align: 'right' });
      
      yPos += 25;
      
      // Table rows
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY);
      
      let rowIndex = 0;
      cart.forEach((item) => {
        const quantity = item.quantity || 1;
        const price = typeof item.price === 'string' ? 
          parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
        const itemTotal = price * quantity;
        
        // Alternating row background
        if (rowIndex % 2 === 0) {
          doc.rect(50, yPos, 495, 22)
             .fillColor('#FAFAFA')
             .fill();
        }
        
        // Row data
        doc.fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
           .text(item.name, 60, yPos + 6, { width: 250 })
           .text(`${quantity}`, 320, yPos + 6, { width: 40, align: 'center' })
           .text(`$${price.toFixed(2)}`, 370, yPos + 6, { width: 70, align: 'right' })
           .text('AAM', 450, yPos + 6, { width: 40, align: 'center' })
           .text(`$${itemTotal.toFixed(2)}`, 495, yPos + 6, { width: 50, align: 'right' });
        
        // Row border
        doc.moveTo(50, yPos + 22)
           .lineTo(545, yPos + 22)
           .strokeColor(INVOICE_CONFIG.COLORS.BORDER)
           .lineWidth(0.5)
           .stroke();
        
        yPos += 22;
        rowIndex++;
      });
      
      // ============================================
      // TOTALS SECTION
      // ============================================
      
      yPos += 20;
      
      // Subtotal
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.DARK_GRAY)
         .text('Subtotal:', 370, yPos, { width: 100, align: 'right' })
         .text(`$${totalAmount.toFixed(2)}`, 480, yPos, { width: 65, align: 'right' });
      
      yPos += 20;
      
      // Tax (AAM - exempt)
      doc.text('Tax (AAM - exempt):', 370, yPos, { width: 100, align: 'right' })
         .text('$0.00', 480, yPos, { width: 65, align: 'right' });
      
      yPos += 30;
      
      // Grand Total - highlighted box
      doc.rect(350, yPos - 5, 195, 35)
         .fillColor('#F5F5F5')
         .fill();
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(INVOICE_CONFIG.COLORS.BLACK)
         .text('GRAND TOTAL:', 370, yPos + 6, { width: 100, align: 'right' });
      
      doc.fontSize(14)
         .fillColor(INVOICE_CONFIG.COLORS.ACCENT)
         .text(`$${totalAmount.toFixed(2)}`, 480, yPos + 6, { width: 65, align: 'right' });
      
      // ============================================
      // FOOTER
      // ============================================
      
      const footerY = 750;
      
      // Footer border
      doc.moveTo(50, footerY)
         .lineTo(545, footerY)
         .strokeColor(INVOICE_CONFIG.COLORS.BORDER)
         .lineWidth(1)
         .stroke();
      
      // Footer text
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor(INVOICE_CONFIG.COLORS.MEDIUM_GRAY)
         .text(
           `Thank you for your purchase | ${INVOICE_CONFIG.BRAND.NAME}.com`,
           50,
           footerY + 15,
           { align: 'center', width: 495 }
         );
      
      doc.fontSize(7)
         .fillColor(INVOICE_CONFIG.COLORS.LIGHT_GRAY)
         .text(
           'This is an electronically generated invoice and is valid without signature.',
           50,
           footerY + 30,
           { align: 'center', width: 495 }
         );
      
      // Finalize PDF
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateInvoicePDF
};