require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');
const rateLimit = require('express-rate-limit');

// Import new modules
const { 
  determineEmailTemplate, 
  generateEmail 
} = require('./emailTemplates');

const {
  generateDownloadLinks,
  validateDownloadToken,
  markTokenAsUsed,
  getProductFilePath,
  getProductFileName
} = require('./downloadLinkService');

const { generateInvoicePDF } = require('./pdfInvoiceGenerator');

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
  DOMAIN: process.env.DOMAIN
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
// SEND ORDER EMAIL WITH PDF INVOICE
// ============================================
async function sendOrderEmail(orderData, totalAmount, invoiceNumber, downloadLinks = null) {
  try {
    const { customerData, cart } = orderData;
    
    // Determine template type
    const templateType = determineEmailTemplate(cart);
    console.log(`📧 Using email template: ${templateType}`);
    
    // Generate PDF invoice
    console.log('📄 Generating PDF invoice...');
    const pdfBuffer = await generateInvoicePDF(orderData, totalAmount, invoiceNumber);
    console.log('✅ PDF invoice generated');
    
    // Generate email content
    const { subject, html } = generateEmail(templateType, orderData, totalAmount, downloadLinks);
    
    // Send email with PDF attachment
    const result = await resend.emails.send({
      from: `Senkisem.com <${CONFIG.EMAIL.FROM}>`,
      to: customerData.email,
      subject: subject,
      html: html,
      attachments: [
        {
          filename: `Invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
        }
      ]
    });
    
    console.log('✅ Email sent successfully:', result.id);
    return result;
    
  } catch (error) {
    console.error('❌ Email send error:', error);
    throw error;
  }
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
    
    // ✅ GENERATE DOWNLOAD LINKS (if digital products)
    let downloadLinks = null;
    const hasDigitalProducts = cart.some(item => [2, 4, 300].includes(item.id));
    
    if (hasDigitalProducts) {
      console.log('📥 Generating download links...');
      downloadLinks = await generateDownloadLinks(
        cart, 
        customerData.email, 
        invoiceNumber,
        CONFIG.DOMAIN
      );
      console.log('✅ Download links generated');
    }
    
    // ✅ SEND CONFIRMATION EMAIL WITH PDF & DOWNLOAD LINKS
    try {
      await sendOrderEmail(orderData, totalAmount, invoiceNumber, downloadLinks);
      console.log('✅ Confirmation email sent to:', customerData.email);
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

// Rate limiting for download endpoint
const downloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per IP
  message: 'Too many download attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

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

    // ✅ IMMEDIATE SAVE TO GOOGLE SHEETS + SEND EMAIL WITH PDF & DOWNLOAD LINKS
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
// DOWNLOAD ROUTE
// ============================================
app.get('/download/:token', downloadLimiter, async (req, res) => {
  const { token } = req.params;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  console.log(`📥 Download attempt - Token: ${token.substring(0, 8)}... IP: ${ipAddress}`);
  
  try {
    // Validate token
    const validation = await validateDownloadToken(token, ipAddress);
    
    if (!validation.valid) {
      console.log(`❌ Download denied - Reason: ${validation.reason}`);
      return res.redirect(`/download-error.html?reason=${validation.reason}`);
    }
    
    // Get product file path
    const filePath = getProductFilePath(validation.productId);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return res.redirect('/download-error.html?reason=server-error');
    }
    
    // Mark token as used
    await markTokenAsUsed(validation.tokenRow, ipAddress);
    
    // Get download filename
    const fileName = getProductFileName(validation.productId);
    
    // Send file
    console.log(`✅ Sending file: ${fileName}`);
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('❌ File send error:', err);
        if (!res.headersSent) {
          res.redirect('/download-error.html?reason=server-error');
        }
      } else {
        console.log(`✅ Download complete: ${fileName} to ${validation.email}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Download error:', error);
    res.redirect('/download-error.html?reason=server-error');
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
    pdf_invoice_enabled: true,
    download_links_enabled: true,
    templates: ['digitalProduct1', 'digitalProduct2', 'digitalBundle', 'physicalProduct']
  });
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, 'dist')));

// Serve download-error.html from root directory
app.get('/download-error.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'download-error.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   🚀 SENKISEM SERVER - REFACTORED V2.0               ║
╠═══════════════════════════════════════════════════════╣
║   Port: ${PORT}                                       ║
║   Currency: USD ($)                                   ║
║   Shipping: $15.00 (Home Delivery)                    ║
╠═══════════════════════════════════════════════════════╣
║   ✅ Stripe + Webhook                                ║
║   ✅ Google Sheets (Orders + Download Links)         ║
║   ✅ Professional Email Templates (4 types)          ║
║   ✅ Redesigned PDF Invoice (PDFKit)                 ║
║   ✅ Download Link System (UUID + 7-day expiry)      ║
║   ✅ IP Logging + One-time Use Security              ║
║   ✅ Rate Limiting (5 req/min on downloads)          ║
╠═══════════════════════════════════════════════════════╣
║   📧 Template A: Digital Product 1 (ID 2)            ║
║   📧 Template B: Digital Product 2 (ID 4)            ║
║   📧 Template C: Digital Bundle (ID 300)             ║
║   📧 Template D: Physical Products                   ║
╚═══════════════════════════════════════════════════════╝
  `);
});