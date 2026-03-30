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

// Import modules
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
  console.error(`Missing environment variables:\n${missingVars.join('\n')}`);
  process.exit(1);
}

console.log('Environment variables OK\n');

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
    BCC: 'bellerzoltanezra@gmail.com',
  },
  DOMAIN: process.env.DOMAIN
};

// ============================================
// PROMO CODES
// ============================================
const PROMO_CODES = {
  'FREESHIP0808': { type: 'free_shipping' }
};

// ============================================
// LOAD PRODUCTS
// ============================================
let products = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'product.json'), 'utf8');
  products = JSON.parse(data).products || JSON.parse(data);
  console.log(`${products.length} products loaded`);
} catch (err) {
  console.error('product.json error:', err.message);
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
  if (!sheet) throw new Error('2026 worksheet not found!');
  return sheet;
}

// ============================================
// GENERATE NEXT INVOICE NUMBER
// ============================================
async function generateNextInvoiceNumber() {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const rows = await sheet.getRows();
    
    const invoiceNumbers = rows
      .map(row => row.get('Számla Szám'))
      .filter(num => num && num.startsWith('E-SEN-2026-'))
      .map(num => parseInt(num.replace('E-SEN-2026-', '')))
      .filter(num => !isNaN(num));
    
    const maxNumber = invoiceNumbers.length > 0 ? Math.max(...invoiceNumbers) : 0;
    const nextNumber = maxNumber + 1;
    const invoiceNumber = `E-SEN-2026-${String(nextNumber).padStart(3, '0')}`;
    
    console.log(`Generated invoice number: ${invoiceNumber}`);
    return invoiceNumber;
    
  } catch (error) {
    console.error('Invoice number generation error:', error);
    return `E-SEN-2026-${String(Date.now()).slice(-3)}`;
  }
}

// ============================================
// CALCULATE SHIPPING COST
// ============================================
// ============================================
// CALCULATE SHIPPING COST
// ============================================
function calculateShippingCost(cart, shippingMethod, promoCode = '') {
  const ebookIds = [2, 4, 300];
  const isAllDigital = cart.every(item => ebookIds.includes(item.id));

  if (isAllDigital || shippingMethod === 'digital') return 0;

  if (shippingMethod === 'home') {
    const promo = PROMO_CODES[(promoCode || '').toUpperCase()];
    if (promo && promo.type === 'free_shipping') {
      console.log(`Promo code applied: ${promoCode} — free shipping`);
      return 0;
    }
    return CONFIG.SHIPPING.HOME_DELIVERY_COST;
  }

  return 0;
}

// ============================================
// EMAIL SENDING WITH BCC
// ============================================
async function sendOrderEmail(orderData, totalAmount, invoiceNumber, downloadLinks = null) {
  try {
    const { customerData, cart } = orderData;
    
    const templateType = determineEmailTemplate(cart);
    console.log(`Using email template: ${templateType}`);
    
    console.log('Generating PDF invoice...');
    const pdfBuffer = await generateInvoicePDF(orderData, totalAmount, invoiceNumber);
    console.log('PDF invoice generated');
    
    const { subject, html } = generateEmail(templateType, orderData, totalAmount, downloadLinks);
    
    const result = await resend.emails.send({
      from: `Senkisem.com <${CONFIG.EMAIL.FROM}>`,
      to: customerData.email,
      bcc: CONFIG.EMAIL.BCC,
      subject: subject,
      html: html,
      attachments: [
        {
          filename: `Invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
        }
      ]
    });
    
    console.log('Email sent successfully:', customerData.email);
    console.log(`BCC copy sent to: ${CONFIG.EMAIL.BCC}`);
    return result;
    
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
}

// ============================================
// SAVE ORDER TO SHEETS (WITHOUT EMAIL!)
// FIX: orderData JSON saved to Sheets instead of Stripe metadata
// ============================================
async function saveOrderToSheets(orderData, sessionId) {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const { cart, customerData } = orderData;
    
    const invoiceNumber = await generateNextInvoiceNumber();
    
    const productTotal = cart.reduce((sum, item) => {
      const price = typeof item.price === 'string' ? 
        parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
      const quantity = item.quantity || 1;
      return sum + (price * quantity);
    }, 0);
    
const shippingCost = calculateShippingCost(cart, customerData.shippingMethod, customerData.promoCode);
    const totalAmount = productTotal + shippingCost;
    
    const productNames = cart.map(item => {
      const quantity = item.quantity || 1;
      return quantity > 1 ? `${item.name} (${quantity} db)` : item.name;
    }).join(', ');
    
    const sizes = cart.map(item => item.size || '-').join(', ');
    
    const isEbook = cart.every(item => item.id === 2 || item.id === 4 || item.id === 300);
    const productType = isEbook ? 'E-könyv' : 'Fizikai';
    
    let shippingMethodText = '-';
    if (customerData.shippingMethod === 'home') {
      shippingMethodText = 'Házhozszállítás';
    } else if (customerData.shippingMethod === 'digital') {
      shippingMethodText = 'Digitális';
    }
    
    let deliveryAddress = '-';
    if (customerData.shippingMethod === 'home') {
      const addr = customerData.deliveryAddress || customerData.address;
      const city = customerData.deliveryCity || customerData.city;
      const zip = customerData.deliveryZip || customerData.zip;
      const country = customerData.deliveryCountry || customerData.country;
      deliveryAddress = `${zip} ${city}, ${addr}, ${country}`;
    }
    
    // FIX: 'Order Data JSON' column stores the full orderData (instead of Stripe metadata)
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
      'Számla Szám': invoiceNumber,
      'Order Data JSON': JSON.stringify({ cart, customerData }), // FIX: full data stored here
    });
    
    console.log('Order saved to Sheets (WITHOUT Email)');
    console.log(`   - Session ID: ${sessionId}`);
    console.log(`   - Invoice number: ${invoiceNumber}`);
    console.log(`   - Status: Waiting for payment`);
    
  } catch (error) {
    console.error('Sheets save error:', error.message);
    throw error;
  }
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());

// IMPORTANT: Webhook endpoint needs RAW body!
app.use('/webhook/stripe', express.raw({type: 'application/json'}));

app.use(express.json());

const downloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: 'Too many download attempts.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================
// ROUTES
// ============================================

// Create Stripe session + SHEETS SAVE (WITHOUT EMAIL)
app.post('/create-payment-session', async (req, res) => {
  const { cart, customerData } = req.body;

  try {
    const ebookIds = [2, 4, 300];
    const isEbook = cart.every(item => ebookIds.includes(item.id));

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

    const shippingCost = calculateShippingCost(cart, customerData.shippingMethod, customerData.promoCode);
if (!isEbook && shippingCost > 0) {
  lineItems.push({
    price_data: {
      currency: 'usd',
      product_data: { name: 'Home Delivery' },
      unit_amount: shippingCost * 100,
    },
    quantity: 1,
  });
}

    // FIX: metadata only contains a short identifier, orderData is stored in Sheets
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: isEbook 
        ? `${process.env.DOMAIN}/success2.html?session_id={CHECKOUT_SESSION_ID}`
        : `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
      metadata: {
        source: 'senkisem.com' // FIX: short marker only, no orderData here
      },
      customer_email: customerData.email,
    });

    // Save order IMMEDIATELY to Sheets (without email, with orderData JSON)
    await saveOrderToSheets({ cart, customerData }, session.id);

    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK - EMAIL SENDING HAPPENS HERE!
// ============================================
app.post('/webhook/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('\n========================================');
    console.log('SUCCESSFUL PAYMENT RECEIVED!');
    console.log('========================================');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Email: ${session.customer_email}`);
    console.log(`   Amount: $${(session.amount_total / 100).toFixed(2)}`);

    try {
      // 1. UPDATE STATUS IN SHEETS
      const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
      const rows = await sheet.getRows();
      
      const orderRow = rows.find(row => row.get('Rendelés ID') === session.id);
      
      if (!orderRow) {
        console.error('Order not found in Sheets:', session.id);
        return res.json({ received: true });
      }

      orderRow.set('Státusz', 'Fizetve ✅');
      await orderRow.save();
      console.log('Status updated: Fizetve');

      // 2. READ ORDER DATA BACK FROM SHEETS
      // FIX: read from Sheets, not from Stripe metadata
      const orderDataJSON = orderRow.get('Order Data JSON');
      
      if (!orderDataJSON) {
        console.error('No Order Data JSON in Sheets for order:', session.id);
        return res.json({ received: true });
      }

      const orderData = JSON.parse(orderDataJSON);
      const { cart, customerData } = orderData;
      
      // 3. CALCULATE INVOICE NUMBER AND AMOUNT
      const invoiceNumber = orderRow.get('Számla Szám');
      
      const productTotal = cart.reduce((sum, item) => {
        const price = typeof item.price === 'string' ? 
          parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
        const quantity = item.quantity || 1;
        return sum + (price * quantity);
      }, 0);
      
const shippingCost = calculateShippingCost(cart, customerData.shippingMethod, customerData.promoCode);
      const totalAmount = productTotal + shippingCost;

      // 4. GENERATE DOWNLOAD LINKS (if digital)
      let downloadLinks = null;
      const hasDigitalProducts = cart.some(item => [2, 4, 300].includes(item.id));
      
      if (hasDigitalProducts) {
        console.log('Generating download links...');
        downloadLinks = await generateDownloadLinks(
          cart, 
          customerData.email, 
          invoiceNumber,
          CONFIG.DOMAIN
        );
        console.log('Download links generated');
      }

      // 5. SEND EMAIL (WITH PDF INVOICE, DOWNLOAD LINKS AND BCC!)
      console.log('Sending email...');
      await sendOrderEmail(orderData, totalAmount, invoiceNumber, downloadLinks);
      console.log('Email sent successfully:', customerData.email);
      console.log(`BCC copy sent to: ${CONFIG.EMAIL.BCC}`);
      
      console.log('========================================');
      console.log('ORDER PROCESSING COMPLETE!');
      console.log('========================================\n');

    } catch (error) {
      console.error('Webhook processing error:', error);
      // Don't throw error - Stripe will retry
    }
  }

  res.json({ received: true });
});

// ============================================
// DOWNLOAD ROUTE
// ============================================
app.get('/download/:token', downloadLimiter, async (req, res) => {
  const { token } = req.params;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  console.log(`Download attempt - Token: ${token.substring(0, 8)}... IP: ${ipAddress}`);
  
  try {
    const validation = await validateDownloadToken(token, ipAddress);
    
    if (!validation.valid) {
      console.log(`Download denied - Reason: ${validation.reason}`);
      return res.redirect(`/download-error.html?reason=${validation.reason}`);
    }
    
    const filePath = getProductFilePath(validation.productId);
    
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return res.redirect('/download-error.html?reason=server-error');
    }
    
    await markTokenAsUsed(validation.tokenRow, ipAddress);
    
    const fileName = getProductFileName(validation.productId);
    
    console.log(`Sending file: ${fileName}`);
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('File send error:', err);
        if (!res.headersSent) {
          res.redirect('/download-error.html?reason=server-error');
        }
      } else {
        console.log(`Download complete: ${fileName}`);
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.redirect('/download-error.html?reason=server-error');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    webhook_enabled: true,
    email_on_payment_only: true,
    bcc_enabled: true,
    bcc_address: CONFIG.EMAIL.BCC,
    currency: 'USD',
    shipping: '$15.00'
  });
});

// ============================================
// STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
+-------------------------------------------------------+
|   SENKISEM.COM SERVER - WEBHOOK + BCC VERSION        |
+-------------------------------------------------------+
|   Port: ${PORT}                                       |
|   Currency: USD ($)                                   |
|   Shipping: $15.00 (Home Delivery)                    |
|   Webhook: ACTIVE                                     |
|   Email: Only after successful payment!               |
|   BCC: ${CONFIG.EMAIL.BCC}           |
+-------------------------------------------------------+
|   WORKFLOW:                                           |
|   1. Order -> Sheets save (Waiting for payment)       |
|   2. Stripe payment                                   |
|   3. Webhook -> Status update (Fizetve)               |
|   4. Webhook -> Email sent (TO + BCC + PDF)           |
+-------------------------------------------------------+
  `);
});