require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');

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
  INVOICE: {
    SELLER_NAME: 'SENKISEM EV',
    SELLER_ID: '60502292',
    SELLER_ADDRESS: '3600 Ózd Bolyki Tamás utca 15. A épület 1. emelet 5-6. ajtó',
    SELLER_TAX_NUMBER: '91113654-1-25',
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
// GENERATE NEXT INVOICE NUMBER
// ============================================
async function generateNextInvoiceNumber() {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const rows = await sheet.getRows();
    
    // Find all existing invoice numbers
    const invoiceNumbers = rows
      .map(row => row.get('Számla Szám'))
      .filter(num => num && num.startsWith('E-SEN-2026-'))
      .map(num => parseInt(num.replace('E-SEN-2026-', '')))
      .filter(num => !isNaN(num));
    
    // Get the highest number
    const maxNumber = invoiceNumbers.length > 0 ? Math.max(...invoiceNumbers) : 0;
    
    // Generate next number
    const nextNumber = maxNumber + 1;
    const invoiceNumber = `E-SEN-2026-${String(nextNumber).padStart(3, '0')}`;
    
    console.log(`✅ Generated invoice number: ${invoiceNumber}`);
    return invoiceNumber;
    
  } catch (error) {
    console.error('❌ Invoice number generation error:', error);
    // Fallback to timestamp-based number
    return `E-SEN-2026-${String(Date.now()).slice(-3)}`;
  }
}

// ============================================
// GENERATE PDF INVOICE
// ============================================
async function generateInvoicePDF(orderData, totalAmount, invoiceNumber) {
  return new Promise((resolve, reject) => {
    try {
      const { customerData, cart } = orderData;
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header - Company Info
      doc.fontSize(20).font('Helvetica-Bold').text('ELECTRONIC INVOICE', { align: 'center' });
      doc.moveDown(0.5);
      
      // Seller info box
      doc.fontSize(10).font('Helvetica-Bold').text('SELLER:', 50, 100);
      doc.fontSize(9).font('Helvetica')
        .text(CONFIG.INVOICE.SELLER_NAME, 50, 115)
        .text(`Registration: ${CONFIG.INVOICE.SELLER_ID}`, 50, 128)
        .text(CONFIG.INVOICE.SELLER_ADDRESS, 50, 141)
        .text(`Tax Number: ${CONFIG.INVOICE.SELLER_TAX_NUMBER}`, 50, 154);
      
      // Invoice details box (right side)
      doc.fontSize(10).font('Helvetica-Bold').text('Invoice Number:', 350, 100);
      doc.fontSize(9).font('Helvetica').text(invoiceNumber, 350, 115);
      
      doc.fontSize(10).font('Helvetica-Bold').text('Issue Date:', 350, 135);
      doc.fontSize(9).font('Helvetica').text(new Date().toLocaleDateString('en-US'), 350, 150);
      
      doc.fontSize(10).font('Helvetica-Bold').text('Payment Method:', 350, 170);
      doc.fontSize(9).font('Helvetica').text('Bank Card', 350, 185);
      
      // Separator line
      doc.moveTo(50, 210).lineTo(545, 210).stroke();
      
      // Buyer info
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica-Bold').text('BUYER:', 50, 230);
      doc.fontSize(9).font('Helvetica')
        .text(customerData.fullName || '-', 50, 245);
      
      const buyerAddress = `${customerData.country || ''}, ${customerData.zip || ''} ${customerData.city || ''}, ${customerData.address || ''}`.trim();
      doc.text(buyerAddress, 50, 258, { width: 490 });
      
      // Items table header
      doc.moveDown(2);
      const tableTop = 300;
      
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Item', 50, tableTop);
      doc.text('Qty', 300, tableTop, { width: 50, align: 'center' });
      doc.text('Unit Price', 360, tableTop, { width: 80, align: 'right' });
      doc.text('VAT', 450, tableTop, { width: 45, align: 'center' });
      doc.text('Total', 500, tableTop, { width: 95, align: 'right' });
      
      // Table line
      doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();
      
      // Items
      let yPosition = tableTop + 25;
      doc.font('Helvetica');
      
      cart.forEach((item, index) => {
        const quantity = item.quantity || 1;
        const price = typeof item.price === 'string' ? 
          parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
        const itemTotal = price * quantity;
        
        doc.text(item.name, 50, yPosition, { width: 240 });
        doc.text(`${quantity} pcs`, 300, yPosition, { width: 50, align: 'center' });
        doc.text(`$${price.toFixed(2)}`, 360, yPosition, { width: 80, align: 'right' });
        doc.text('AAM', 450, yPosition, { width: 45, align: 'center' });
        doc.text(`$${itemTotal.toFixed(2)}`, 500, yPosition, { width: 95, align: 'right' });
        
        yPosition += 20;
      });
      
      // Separator before totals
      doc.moveTo(50, yPosition + 5).lineTo(545, yPosition + 5).stroke();
      yPosition += 20;
      
      // Totals
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('TOTAL:', 400, yPosition);
      doc.text(`$${totalAmount.toFixed(2)}`, 500, yPosition, { width: 95, align: 'right' });
      
      yPosition += 20;
      doc.fontSize(9).font('Helvetica');
      doc.text('Tax-exempt (AAM)', 400, yPosition);
      doc.text('$0.00', 500, yPosition, { width: 95, align: 'right' });
      
      yPosition += 25;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('GRAND TOTAL:', 400, yPosition);
      doc.text(`$${totalAmount.toFixed(2)}`, 500, yPosition, { width: 95, align: 'right' });
      
      // Footer note
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text(
        'This is an electronically generated invoice. Thank you for your purchase!',
        50,
        750,
        { align: 'center', width: 495 }
      );
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// EMAIL TEMPLATE GENERATOR (ENGLISH)
// ============================================
function generateOrderConfirmationEmail(orderData, totalAmount) {
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
              <p style="margin: 10px 0 0 0; color: #e0e7ff; font-size: 16px;">Successful purchase at Senkisem.com</p>
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
                We have successfully received your order! Your payment has been confirmed and the following ${isEbook ? 'e-book(s)' : 'product(s)'} will be processed:
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
                      <td colspan="2" style="padding: 16px 12px 0 12px; text-align: right; font-size: 16px; font-weight: 600; color: #111827;">Total Amount:</td>
                      <td style="padding: 16px 12px 0 12px; text-align: right; font-size: 18px; font-weight: 700; color: #667eea;">$${totalAmount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              <!-- Next Steps -->
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1e40af; font-weight: 600;">📧 What's Next?</h3>
                <p style="margin: 0; font-size: 14px; color: #1e3a8a; line-height: 1.6;">
                  ${isEbook 
                    ? 'You will receive a <strong>separate email</strong> with the download link(s) for your e-book(s) shortly, along with your official invoice attached.' 
                    : 'You will receive a <strong>separate email</strong> with shipping information and your official invoice shortly.'}
                </p>
              </div>
              
              <!-- Invoice Attached -->
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #047857; font-weight: 600;">📄 Invoice Attached</h3>
                <p style="margin: 0; font-size: 14px; color: #065f46; line-height: 1.6;">
                  Please find your official invoice attached to this email (PDF format).
                </p>
              </div>
              
              <!-- Contact Info -->
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                If you have any questions, feel free to contact us:
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
async function sendOrderConfirmationEmail(orderData, totalAmount, invoiceNumber) {
  try {
    const { customerData } = orderData;
    
    // Generate PDF invoice
    const pdfBuffer = await generateInvoicePDF(orderData, totalAmount, invoiceNumber);
    
    // Generate email HTML
    const emailHtml = generateOrderConfirmationEmail(orderData, totalAmount);
    
    // Send email with PDF attachment
    const result = await resend.emails.send({
      from: `Senkisem.com <${CONFIG.EMAIL.FROM}>`,
      to: customerData.email,
      subject: `✅ Order Confirmation - Senkisem.com`,
      html: emailHtml,
      attachments: [
        {
          filename: `Invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
        }
      ]
    });
    
    console.log('✅ Email with invoice PDF sent successfully:', result.id);
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
// SAVE ORDER TO SHEETS + SEND EMAIL
// ============================================
async function saveOrderToSheets(orderData, sessionId) {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    
    const { cart, customerData } = orderData;
    
    // Generate invoice number
    const invoiceNumber = await generateNextInvoiceNumber();
    
    // Calculate totals
    const productTotal = cart.reduce((sum, item) => {
      const price = typeof item.price === 'string' ? 
        parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
      const quantity = item.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
    const shippingCost = calculateShippingCost(cart, customerData.shippingMethod);
    const totalAmount = productTotal + shippingCost;
    
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
      'Számla Szám': invoiceNumber
    });
    
    console.log('✅ Sheets save OK - Order ID:', sessionId, 'Invoice:', invoiceNumber);
    
    // ✅ SEND CONFIRMATION EMAIL WITH PDF IMMEDIATELY
    try {
      await sendOrderConfirmationEmail(orderData, totalAmount, invoiceNumber);
      console.log('✅ Confirmation email with PDF sent to:', customerData.email);
    } catch (emailError) {
      console.error('⚠️ Email send failed (but order saved):', emailError.message);
      // Don't throw - order is already saved to sheets
    }
    
  } catch (error) {
    console.error('⚠️ Sheets save error:', error.message);
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

// Create Stripe payment session + IMMEDIATE SHEETS SAVE + EMAIL
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

    // ✅ IMMEDIATE SAVE TO GOOGLE SHEETS + SEND EMAIL WITH PDF
    await saveOrderToSheets(
      { cart, customerData }, 
      session.id
    );

    // ✅ Response to frontend
    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('❌ Session/Sheets/Email error:', error);
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
    pdf_invoice_enabled: true
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
║   ✅ Resend Email (ORDER CONFIRMATION)   ║
║   ✅ PDF Invoice Generation (PDFKit)     ║
║   ✅ Auto Invoice Numbering (E-SEN-2026) ║
╚═══════════════════════════════════════════╝
  `);
});