require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');
const { spawn } = require('child_process');

// ============================================
// ENV VALIDATION
// ============================================
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'DOMAIN',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing environment variables:\n${missingVars.join('\n')}`);
  process.exit(1);
}

console.log('✅ Environment variables OK\n');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================
// CONFIG
// ============================================
const CONFIG = {
  SHEETS: {
    ORDERS: '1ysbyF0uCl1W03aGArpFYDIU6leFFRJb0R1AaadVarGk',
  },
  SHIPPING: {
    HOME_DELIVERY_COST: 15, // $15.00
  },
  EMAIL: {
    FROM: process.env.RESEND_FROM_EMAIL,
  },
  SELLER: {
    NAME: 'SENKISEM EV',
    TAX_NUMBER: '91113654-1-25',
    COMPANY_ID: '60502292',
    ADDRESS: '3600 Ózd, Bolyki Tamás utca 15. A épület 1. emelet 5-6. ajtó',
    COUNTRY: 'Hungary'
  }
};

// ============================================
// LOAD PRODUCTS
// ============================================
let products = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'product.json'), 'utf8');
  products = JSON.parse(data).products || JSON.parse(data);
  console.log(`✅ ${products.length} products loaded`);
} catch (err) {
  console.error('❌ product.json error:', err.message);
}

// ============================================
// GOOGLE CLIENT SETUP
// ============================================
function getGoogleAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheet(sheetId) {
  const doc = new GoogleSpreadsheet(sheetId, getGoogleAuth());
  await doc.loadInfo();
  
  const sheet = doc.sheetsByTitle['2026'];
  
  if (!sheet) {
    throw new Error('❌ 2026 worksheet not found!');
  }
  
  console.log(`✅ Worksheet loaded: ${sheet.title}`);
  return sheet;
}

// ============================================
// GET NEXT INVOICE NUMBER
// ============================================
async function getNextInvoiceNumber() {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const rows = await sheet.getRows();
    
    // Find the highest invoice number
    let maxNumber = 0;
    
    for (const row of rows) {
      const invoiceNum = row.get('Számla szám');
      if (invoiceNum && invoiceNum.startsWith('E-SEN-2026-')) {
        const numStr = invoiceNum.replace('E-SEN-2026-', '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    
    const nextNumber = maxNumber + 1;
    return `E-SEN-2026-${String(nextNumber).padStart(3, '0')}`;
    
  } catch (error) {
    console.error('⚠️ Error getting invoice number, using 001:', error.message);
    return 'E-SEN-2026-001';
  }
}

// ============================================
// GENERATE PDF INVOICE
// ============================================
async function generateInvoicePDF(orderData, invoiceNumber, totalAmount) {
  const { customerData, cart } = orderData;
  
  // Calculate product total
  const productTotal = cart.reduce((sum, item) => {
    const price = typeof item.price === 'string' ? 
      parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
    const quantity = item.quantity || 1;
    return sum + (price * quantity);
  }, 0);
  
  const shippingCost = calculateShippingCost(cart, customerData.shippingMethod);
  
  // Format dates
  const currentDate = new Date().toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Customer address
  const customerAddress = `${customerData.country}\n${customerData.zip} ${customerData.city}, ${customerData.address}`;
  
  // Create Python script for PDF generation
  const pythonScript = `
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Table, TableStyle

# Create PDF
pdf_path = "${path.join(__dirname, 'temp', `invoice_${invoiceNumber}.pdf`)}"
c = canvas.Canvas(pdf_path, pagesize=A4)
width, height = A4

# Colors
brand_color = colors.HexColor('#667eea')
dark_color = colors.HexColor('#1f2937')
gray_color = colors.HexColor('#6b7280')
light_gray = colors.HexColor('#f3f4f6')

# Header with brand color bar
c.setFillColor(brand_color)
c.rect(0, height - 15*mm, width, 15*mm, fill=1, stroke=0)

c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 20)
c.drawString(20*mm, height - 11*mm, "ELECTRONIC INVOICE")

# Invoice number
c.setFont("Helvetica-Bold", 11)
c.drawRightString(width - 20*mm, height - 11*mm, "${invoiceNumber}")

# Seller information box
c.setFillColor(light_gray)
c.roundRect(20*mm, height - 60*mm, 80*mm, 35*mm, 3*mm, fill=1, stroke=0)

c.setFillColor(dark_color)
c.setFont("Helvetica-Bold", 10)
c.drawString(25*mm, height - 25*mm, "SELLER:")

c.setFont("Helvetica-Bold", 11)
c.drawString(25*mm, height - 30*mm, "${CONFIG.SELLER.NAME}")

c.setFont("Helvetica", 9)
c.drawString(25*mm, height - 35*mm, "${CONFIG.SELLER.ADDRESS}")
c.drawString(25*mm, height - 40*mm, "${CONFIG.SELLER.COUNTRY}")
c.drawString(25*mm, height - 45*mm, f"Company ID: ${CONFIG.SELLER.COMPANY_ID}")
c.drawString(25*mm, height - 50*mm, f"Tax Number: ${CONFIG.SELLER.TAX_NUMBER}")
c.drawString(25*mm, height - 55*mm, "VAT Status: TAM (Exempt)")

# Buyer information box
c.setFillColor(colors.white)
c.setStrokeColor(gray_color)
c.setLineWidth(1)
c.roundRect(110*mm, height - 60*mm, 80*mm, 35*mm, 3*mm, fill=1, stroke=1)

c.setFillColor(dark_color)
c.setFont("Helvetica-Bold", 10)
c.drawString(115*mm, height - 25*mm, "BUYER:")

c.setFont("Helvetica-Bold", 11)
c.drawString(115*mm, height - 30*mm, "${customerData.fullName}")

c.setFont("Helvetica", 9)
# Handle multi-line address
address_lines = """${customerAddress}""".strip().split('\\n')
y_pos = height - 35*mm
for line in address_lines:
    c.drawString(115*mm, y_pos, line)
    y_pos -= 4*mm

# Invoice details
c.setFillColor(dark_color)
c.setFont("Helvetica", 9)
c.drawString(20*mm, height - 70*mm, f"Issue Date: ${currentDate}")
c.drawString(20*mm, height - 75*mm, f"Performance Date: ${currentDate}")
c.drawString(20*mm, height - 80*mm, f"Payment Method: Bank Card")

# Products table
table_data = [
    ['Description', 'Quantity', 'Unit Price', 'Net Amount', 'VAT', 'Gross Amount']
]

${cart.map(item => {
  const price = typeof item.price === 'string' ? 
    parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
  const quantity = item.quantity || 1;
  const itemTotal = price * quantity;
  return `table_data.append(['${item.name.replace(/'/g, "\\'")}', '${quantity} pcs', '$${price.toFixed(2)}', '$${itemTotal.toFixed(2)}', 'TAM', '$${itemTotal.toFixed(2)}'])`;
}).join('\n')}

${shippingCost > 0 ? `table_data.append(['Home Delivery', '1 pcs', '$${shippingCost.toFixed(2)}', '$${shippingCost.toFixed(2)}', 'TAM', '$${shippingCost.toFixed(2)}'])` : ''}

# Create table
table = Table(table_data, colWidths=[65*mm, 20*mm, 25*mm, 25*mm, 15*mm, 25*mm])
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), brand_color),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('ALIGN', (0, 1), (0, -1), 'LEFT'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 9),
    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
    ('TOPPADDING', (0, 0), (-1, 0), 8),
    ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
    ('TOPPADDING', (0, 1), (-1, -1), 6),
    ('GRID', (0, 0), (-1, -1), 0.5, gray_color),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_gray]),
]))

# Draw table
table.wrapOn(c, width, height)
table.drawOn(c, 20*mm, height - 145*mm)

# Summary box
summary_y = height - 165*mm
c.setFillColor(light_gray)
c.roundRect(110*mm, summary_y - 25*mm, 80*mm, 25*mm, 3*mm, fill=1, stroke=0)

c.setFillColor(dark_color)
c.setFont("Helvetica", 10)
c.drawString(115*mm, summary_y - 5*mm, "Subtotal:")
c.drawRightString(185*mm, summary_y - 5*mm, "$${productTotal.toFixed(2)}")

${shippingCost > 0 ? `
c.drawString(115*mm, summary_y - 10*mm, "Shipping:")
c.drawRightString(185*mm, summary_y - 10*mm, "$${shippingCost.toFixed(2)}")
` : ''}

c.drawString(115*mm, summary_y - 15*mm, "VAT (TAM - Exempt):")
c.drawRightString(185*mm, summary_y - 15*mm, "$0.00")

# Total
c.setFont("Helvetica-Bold", 12)
c.drawString(115*mm, summary_y - 22*mm, "TOTAL:")
c.drawRightString(185*mm, summary_y - 22*mm, "$${totalAmount.toFixed(2)}")

# Footer
c.setFillColor(gray_color)
c.setFont("Helvetica-Oblique", 8)
c.drawCentredString(width/2, 20*mm, "Thank you for your purchase!")
c.drawCentredString(width/2, 16*mm, "For any questions, contact us at ${CONFIG.EMAIL.FROM}")
c.setFont("Helvetica", 7)
c.drawCentredString(width/2, 12*mm, "This is an electronically generated invoice and is valid without signature.")

# Page number
c.drawRightString(width - 20*mm, 10*mm, "Page 1/1")

c.save()
print(f"PDF generated: {pdf_path}")
`;

  return new Promise((resolve, reject) => {
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write Python script to temp file
    const scriptPath = path.join(tempDir, 'generate_invoice.py');
    fs.writeFileSync(scriptPath, pythonScript);

    // Execute Python script
    const pythonProcess = spawn('python3', [scriptPath]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        const pdfPath = path.join(tempDir, `invoice_${invoiceNumber}.pdf`);
        console.log('✅ PDF generated:', pdfPath);
        resolve(pdfPath);
      } else {
        console.error('❌ Python script error:', errorOutput);
        reject(new Error(`PDF generation failed: ${errorOutput}`));
      }
    });
  });
}

// ============================================
// EMAIL TEMPLATE GENERATOR (ENGLISH)
// ============================================
function generateOrderConfirmationEmail(orderData, totalAmount, invoiceNumber) {
  const { customerData, cart } = orderData;
  
  // Product list HTML
  const productRows = cart.map(item => {
    const quantity = item.quantity || 1;
    const price = typeof item.price === 'string' ? 
      parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
    const itemTotal = price * quantity;
    
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${quantity} pcs</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const isEbook = cart.every(item => item.id === 2 || item.id === 4 || item.id === 300);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - Senkisem.com</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Thank You for Your Order!</h1>
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">Successful Purchase at Senkisem.com</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              
              <!-- Greeting -->
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151;">
                Dear <strong>${customerData.fullName}</strong>,
              </p>
              
              <p style="margin: 0 0 30px 0; font-size: 15px; color: #6b7280; line-height: 1.6;">
                We have successfully received your order. After payment confirmation, the following ${isEbook ? 'e-book(s)' : 'product(s)'} will be processed:
              </p>
              
              <!-- Order Summary -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 30px;">
                <h2 style="margin: 0 0 20px 0; font-size: 18px; color: #111827; font-weight: 600;">Order Details</h2>
                
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #e5e7eb;">
                      <th style="padding: 12px; text-align: left; font-size: 14px; font-weight: 600; color: #374151;">Product</th>
                      <th style="padding: 12px; text-align: center; font-size: 14px; font-weight: 600; color: #374151;">Quantity</th>
                      <th style="padding: 12px; text-align: right; font-size: 14px; font-weight: 600; color: #374151;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${productRows}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" style="padding: 16px 12px 0 12px; text-align: right; font-size: 16px; font-weight: 600; color: #111827;">Total:</td>
                      <td style="padding: 16px 12px 0 12px; text-align: right; font-size: 18px; font-weight: 700; color: #667eea;">$${totalAmount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              <!-- Invoice Info -->
              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #065f46; font-weight: 600;">📄 Invoice Attached</h3>
                <p style="margin: 0; font-size: 14px; color: #064e3b; line-height: 1.6;">
                  Your invoice (<strong>${invoiceNumber}</strong>) is attached to this email as a PDF document.
                </p>
              </div>
              
              <!-- Next Steps -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1e40af; font-weight: 600;">📧 Next Steps</h3>
                <p style="margin: 0; font-size: 14px; color: #1e3a8a; line-height: 1.6;">
                  ${isEbook 
                    ? 'After successful payment, we will send you a <strong>separate email</strong> with the download link(s) for your e-book(s).' 
                    : 'After successful payment, we will send you a <strong>separate email</strong> with shipping information.'}
                </p>
              </div>
              
              <!-- Contact Info -->
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                If you have any questions, please feel free to contact us:
              </p>
              <p style="margin: 0 0 30px 0; font-size: 14px;">
                <a href="mailto:${CONFIG.EMAIL.FROM}" style="color: #667eea; text-decoration: none; font-weight: 600;">${CONFIG.EMAIL.FROM}</a>
              </p>
              
              <!-- Closing -->
              <p style="margin: 0; font-size: 15px; color: #374151;">
                Best regards,<br>
                <strong>Senkisem.com Team</strong>
              </p>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Senkisem.com | All rights reserved
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ============================================
// SEND ORDER CONFIRMATION EMAIL WITH PDF
// ============================================
async function sendOrderConfirmationEmail(orderData, totalAmount, invoiceNumber, pdfPath) {
  try {
    const { customerData } = orderData;
    
    const emailHtml = generateOrderConfirmationEmail(orderData, totalAmount, invoiceNumber);
    
    // Read PDF file as base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    
    const result = await resend.emails.send({
      from: `Senkisem.com <${CONFIG.EMAIL.FROM}>`,
      to: customerData.email,
      subject: `✅ Order Confirmation - ${invoiceNumber} - Senkisem.com`,
      html: emailHtml,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBase64,
        }
      ]
    });
    
    console.log('✅ Email with PDF sent successfully:', result.id);
    
    // Clean up temp PDF file
    try {
      fs.unlinkSync(pdfPath);
      console.log('✅ Temp PDF cleaned up');
    } catch (err) {
      console.warn('⚠️ Could not delete temp PDF:', err.message);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Email send error:', error);
    throw error;
  }
}

// ============================================
// CALCULATE SHIPPING COST
// ============================================
function calculateShippingCost(cart, shippingMethod) {
  const ebookIds = [2, 4, 300];
  const isAllDigital = cart.every(item => ebookIds.includes(item.id));
  
  if (isAllDigital || shippingMethod === 'digital') {
    return 0;
  }
  
  if (shippingMethod === 'home') {
    return CONFIG.SHIPPING.HOME_DELIVERY_COST;
  }
  
  return 0;
}

// ============================================
// SAVE ORDER TO SHEETS + GENERATE PDF + SEND EMAIL
// ============================================
async function saveOrderToSheets(orderData, sessionId) {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    
    const { cart, customerData } = orderData;
    
    // Calculate totals
    const productTotal = cart.reduce((sum, item) => {
      const price = typeof item.price === 'string' ? 
        parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
      const quantity = item.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
    const shippingCost = calculateShippingCost(cart, customerData.shippingMethod);
    const totalAmount = productTotal + shippingCost;
    
    // Get next invoice number
    const invoiceNumber = await getNextInvoiceNumber();
    console.log('📄 Generated invoice number:', invoiceNumber);
    
    // Product names and sizes
    const productNames = cart.map(item => {
      const quantity = item.quantity || 1;
      return quantity > 1 ? `${item.name} (${quantity} db)` : item.name;
    }).join(', ');
    
    const sizes = cart.map(item => item.size || '-').join(', ');
    
    // Product type
    const isEbook = cart.every(item => item.id === 2 || item.id === 4 || item.id === 300);
    const productType = isEbook ? 'E-könyv' : 'Fizikai';
    
    // Shipping method text
    let shippingMethodText = '-';
    if (customerData.shippingMethod === 'home') {
      shippingMethodText = 'Házhozszállítás';
    } else if (customerData.shippingMethod === 'digital') {
      shippingMethodText = 'Digitális';
    }
    
    // Delivery address (only for home delivery)
    let deliveryAddress = '-';
    if (customerData.shippingMethod === 'home') {
      const addr = customerData.deliveryAddress || customerData.address;
      const city = customerData.deliveryCity || customerData.city;
      const zip = customerData.deliveryZip || customerData.zip;
      const country = customerData.deliveryCountry || customerData.country;
      deliveryAddress = `${zip} ${city}, ${addr}, ${country}`;
    }
    
    // ✅ ADD ROW TO GOOGLE SHEETS
    await sheet.addRow({
      'Dátum': new Date().toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }),
      'Név': customerData.fullName || '-',
      'Email': customerData.email || '-',
      'Cím': customerData.address || '-',
      'Város': customerData.city || '-',
      'Ország': customerData.country || '-',
      'Irányítószám': customerData.zip || '-',
      'Termékek': productNames,
      'Méretek': sizes,
      'Összeg': `$${productTotal.toFixed(2)}`,
      'Típus': productType,
      'Szállítási mód': shippingMethodText,
      'Szállítási cím': deliveryAddress,
      'Csomagpont név': '-',
      'Szállítási díj': `$${shippingCost.toFixed(2)}`,
      'Végösszeg': `$${totalAmount.toFixed(2)}`,
      'Foxpost követés': '-',
      'Rendelés ID': sessionId || '-',
      'Státusz': 'Fizetésre vár',
      'Szállítási megjegyzés': customerData.deliveryNote || '-',
      'Telefonszám': customerData.phone || '-',
      'Számla szám': invoiceNumber
    });
    
    console.log('✅ Sheets save OK - Order ID:', sessionId);
    
    // ✅ GENERATE PDF INVOICE
    let pdfPath;
    try {
      pdfPath = await generateInvoicePDF(orderData, invoiceNumber, totalAmount);
      console.log('✅ PDF invoice generated:', pdfPath);
    } catch (pdfError) {
      console.error('❌ PDF generation failed:', pdfError.message);
      throw pdfError;
    }
    
    // ✅ SEND CONFIRMATION EMAIL WITH PDF ATTACHMENT
    try {
      await sendOrderConfirmationEmail(orderData, totalAmount, invoiceNumber, pdfPath);
      console.log('✅ Confirmation email with invoice sent to:', customerData.email);
    } catch (emailError) {
      console.error('⚠️ Email send failed (but order saved):', emailError.message);
      // Clean up PDF even if email fails
      try {
        fs.unlinkSync(pdfPath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    
  } catch (error) {
    console.error('⚠️ Order processing error:', error.message);
    throw error;
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use('/webhook/stripe', express.raw({type: 'application/json'}));
app.use(express.json());

// ============================================
// ROUTES
// ============================================

// Create Stripe payment session + IMMEDIATE SHEETS SAVE + PDF + EMAIL
app.post('/create-payment-session', async (req, res) => {
  const { cart, customerData } = req.body;

  try {
    const ebookIds = [2, 4, 300];
    const isEbook = cart.every(item => ebookIds.includes(item.id));

    // ✅ BUILD STRIPE LINE ITEMS
    const lineItems = cart.map(item => {
      const product = products.find(p => p.id === parseInt(item.id));
      if (!product) throw new Error(`Product not found: ${item.id}`);
      
      const quantity = item.quantity || 1;
      
      return {
        price_data: {
          currency: 'usd',
          product_data: { 
            name: product.name,
            metadata: { productId: product.id }
          },
          unit_amount: Math.round(product.price * 100),
        },
        quantity: quantity,
      };
    });

    // Add shipping for physical products
    if (!isEbook) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Home Delivery' },
          unit_amount: CONFIG.SHIPPING.HOME_DELIVERY_COST * 100,
        },
        quantity: 1,
      });
    }

    // ✅ CREATE STRIPE SESSION
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: isEbook 
        ? `${process.env.DOMAIN}/success2.html?session_id={CHECKOUT_SESSION_ID}`
        : `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
      metadata: {
        customerName: customerData.fullName,
        customerEmail: customerData.email,
        shippingMethod: customerData.shippingMethod || 'digital',
      },
      customer_email: customerData.email,
    });

    // ✅ IMMEDIATE SAVE TO GOOGLE SHEETS + GENERATE PDF + SEND EMAIL
    await saveOrderToSheets(
      { cart, customerData }, 
      session.id
    );

    // ✅ Response to frontend
    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('❌ Session/Sheets/PDF/Email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK (status update after payment)
// ============================================
app.post('/webhook/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ Payment completed:', session.id);

    try {
      // Update status in Sheets
      const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
      const rows = await sheet.getRows();
      
      const orderRow = rows.find(row => row.get('Rendelés ID') === session.id);
      
      if (orderRow) {
        orderRow.set('Státusz', 'Fizetve');
        await orderRow.save();
        console.log('✅ Status updated: Fizetve');
      }
    } catch (error) {
      console.error('⚠️ Webhook status update error:', error.message);
    }
  }

  res.json({ received: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    currency: 'USD',
    shipping: '$15.00',
    email_enabled: true,
    pdf_invoices: true
  });
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🚀 SENKISEM SERVER STARTED (EN)        ║
╠═══════════════════════════════════════════╣
║   Port: ${PORT}                           ║
║   Currency: USD ($)                       ║
║   Shipping: $15.00 (Home Delivery)        ║
╠═══════════════════════════════════════════╣
║   ✅ Stripe + Webhook                    ║
║   ✅ Google Sheets (MAGYAR mezők)        ║
║   ✅ PDF Invoices (Auto-numbered)        ║
║   ✅ Resend Email (with PDF attachment)  ║
║   ✅ IMMEDIATE: Save → PDF → Email       ║
╚═══════════════════════════════════════════╝
  `);
});