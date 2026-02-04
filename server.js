require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const PDFDocument = require('pdfkit');
const { google } = require('googleapis');

// ============================================
// ENV VALIDATION
// ============================================
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'DOMAIN',
  'GOOGLE_DRIVE_FOLDER_ID'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing environment variables:\n${missingVars.join('\n')}`);
  process.exit(1);
}

console.log('✅ Environment variables OK\n');

const app = express();

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
  INVOICE: {
    SELLER_NAME: 'SENKISEM EV',
    SELLER_TAX_NUMBER: '91113654-1-25',
    SELLER_ADDRESS: '3600 Ózd, Bolyki Tamás utca 15. A épület 1. emelet 5-6. ajtó',
    SELLER_ID_NUMBER: '60502292'
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
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ],
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
// GENERATE INVOICE NUMBER
// ============================================
async function generateInvoiceNumber() {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const rows = await sheet.getRows();
    
    // Count existing invoices in 2026
    const invoiceCount = rows.filter(row => {
      const date = row.get('Dátum') || '';
      return date.includes('2026');
    }).length;
    
    const nextNumber = (invoiceCount + 1).toString().padStart(3, '0');
    return `E-SEN-2026-${nextNumber}`;
  } catch (error) {
    console.error('⚠️ Invoice number generation error:', error.message);
    return `E-SEN-2026-001`;
  }
}

// ============================================
// CREATE PDF INVOICE
// ============================================
async function createInvoicePDF(orderData, invoiceNumber) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primaryColor = '#1a1a1a';
      const accentColor = '#4a90e2';
      const lightGray = '#f5f5f5';
      
      // HEADER - Company Info
      doc.fontSize(24)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('SENKISEM EV', 50, 50);
      
      doc.fontSize(10)
         .fillColor('#666666')
         .font('Helvetica')
         .text(CONFIG.INVOICE.SELLER_ID_NUMBER, 50, 80)
         .text(CONFIG.INVOICE.SELLER_ADDRESS, 50, 95)
         .text(`Adószám: ${CONFIG.INVOICE.SELLER_TAX_NUMBER}`, 50, 110);

      // INVOICE TYPE
      doc.fontSize(14)
         .fillColor(accentColor)
         .font('Helvetica-Bold')
         .text('ELEKTRONIKUS SZÁMLA', 400, 50, { align: 'right' });

      // INVOICE NUMBER
      doc.fontSize(11)
         .fillColor(primaryColor)
         .font('Helvetica')
         .text(`Sorszám: ${invoiceNumber}`, 400, 75, { align: 'right' });

      // DIVIDER LINE
      doc.moveTo(50, 140)
         .lineTo(545, 140)
         .strokeColor(accentColor)
         .lineWidth(2)
         .stroke();

      // BUYER SECTION
      doc.fontSize(12)
         .fillColor(accentColor)
         .font('Helvetica-Bold')
         .text('VEVŐ', 50, 160);

      doc.fontSize(10)
         .fillColor(primaryColor)
         .font('Helvetica')
         .text(orderData.customerName, 50, 180)
         .text(orderData.customerAddress, 50, 195);

      // INVOICE DETAILS BOX
      const detailsBoxY = 160;
      doc.rect(350, detailsBoxY, 195, 80)
         .fillAndStroke(lightGray, primaryColor);

      doc.fontSize(9)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('Fizetési mód:', 360, detailsBoxY + 10)
         .text('Teljesítés dátuma:', 360, detailsBoxY + 30)
         .text('Kiállítás dátuma:', 360, detailsBoxY + 50);

      doc.font('Helvetica')
         .text('Bankkártya', 460, detailsBoxY + 10)
         .text(orderData.completionDate, 460, detailsBoxY + 30)
         .text(orderData.issueDate, 460, detailsBoxY + 50);

      // PRODUCTS TABLE
      const tableTop = 270;
      
      // Table Header
      doc.rect(50, tableTop, 495, 30)
         .fillAndStroke(accentColor, accentColor);

      doc.fontSize(10)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('Megnevezés', 60, tableTop + 10, { width: 200 })
         .text('Menny.', 270, tableTop + 10, { width: 50 })
         .text('Egységár', 330, tableTop + 10, { width: 60 })
         .text('Nettó ár', 400, tableTop + 10, { width: 60 })
         .text('Áfa', 470, tableTop + 10, { width: 30 });

      // Table Rows
      let currentY = tableTop + 40;
      let totalNet = 0;
      let totalGross = 0;

      orderData.items.forEach((item, index) => {
        const rowColor = index % 2 === 0 ? '#ffffff' : lightGray;
        doc.rect(50, currentY, 495, 25)
           .fillAndStroke(rowColor, '#e0e0e0');

        doc.fontSize(9)
           .fillColor(primaryColor)
           .font('Helvetica')
           .text(item.name, 60, currentY + 8, { width: 200 })
           .text(`${item.quantity} db`, 270, currentY + 8, { width: 50 })
           .text(`$${item.unitPrice.toFixed(2)}`, 330, currentY + 8, { width: 60 })
           .text(`$${item.totalPrice.toFixed(2)}`, 400, currentY + 8, { width: 60 })
           .text('AAM', 470, currentY + 8, { width: 30 });

        totalNet += item.totalPrice;
        totalGross += item.totalPrice;
        currentY += 25;
      });

      // Add shipping if applicable
      if (orderData.shippingCost > 0) {
        const rowColor = orderData.items.length % 2 === 0 ? '#ffffff' : lightGray;
        doc.rect(50, currentY, 495, 25)
           .fillAndStroke(rowColor, '#e0e0e0');

        doc.fontSize(9)
           .fillColor(primaryColor)
           .font('Helvetica')
           .text('Szállítási díj', 60, currentY + 8, { width: 200 })
           .text('1 db', 270, currentY + 8, { width: 50 })
           .text(`$${orderData.shippingCost.toFixed(2)}`, 330, currentY + 8, { width: 60 })
           .text(`$${orderData.shippingCost.toFixed(2)}`, 400, currentY + 8, { width: 60 })
           .text('AAM', 470, currentY + 8, { width: 30 });

        totalNet += orderData.shippingCost;
        totalGross += orderData.shippingCost;
        currentY += 25;
      }

      // SUMMARY SECTION
      currentY += 20;
      
      doc.rect(350, currentY, 195, 80)
         .fillAndStroke(lightGray, primaryColor);

      doc.fontSize(10)
         .fillColor(primaryColor)
         .font('Helvetica')
         .text('Összesen:', 360, currentY + 10)
         .text('Alanyi adómentes:', 360, currentY + 30)
         .text('Áfaérték:', 360, currentY + 50);

      doc.font('Helvetica-Bold')
         .text(`$${totalNet.toFixed(2)}`, 460, currentY + 10)
         .text('0', 460, currentY + 30)
         .text(`$${totalGross.toFixed(2)}`, 460, currentY + 50);

      // TOTAL AMOUNT
      currentY += 90;
      doc.rect(350, currentY, 195, 40)
         .fillAndStroke(accentColor, accentColor);

      doc.fontSize(14)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('Összesen:', 360, currentY + 12)
         .text(`$${totalGross.toFixed(2)}`, 460, currentY + 12);

      // FOOTER
      doc.fontSize(8)
         .fillColor('#999999')
         .font('Helvetica')
         .text('Oldal 1/1', 50, 750, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// UPLOAD TO GOOGLE DRIVE
// ============================================
async function uploadToDrive(pdfBuffer, fileName) {
  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
    };

    const media = {
      mimeType: 'application/pdf',
      body: require('stream').Readable.from(pdfBuffer)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    console.log(`✅ Invoice uploaded to Drive: ${response.data.name}`);
    return response.data;
  } catch (error) {
    console.error('⚠️ Drive upload error:', error.message);
    throw error;
  }
}

// ============================================
// GENERATE AND SAVE INVOICE
// ============================================
async function generateAndSaveInvoice(orderData, sessionId) {
  try {
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();
    
    // Get the latest order data from sheets
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    const rows = await sheet.getRows();
    const orderRow = rows.find(row => row.get('Rendelés ID') === sessionId);
    
    if (!orderRow) {
      throw new Error('Order not found in sheets');
    }

    // Parse order data
    const dateStr = orderRow.get('Dátum');
    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('hu-HU');

    const fullAddress = `${orderRow.get('Ország')}, ${orderRow.get('Irányítószám')} ${orderRow.get('Város')}, ${orderRow.get('Cím')}`;
    
    // Parse products
    const productsStr = orderRow.get('Termékek');
    const items = orderData.cart.map(item => {
      const price = typeof item.price === 'string' ? 
        parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
      const quantity = item.quantity || 1;
      
      return {
        name: item.name,
        quantity: quantity,
        unitPrice: price,
        totalPrice: price * quantity
      };
    });

    const shippingCost = calculateShippingCost(orderData.cart, orderData.customerData.shippingMethod);

    const invoiceData = {
      customerName: orderRow.get('Név'),
      customerAddress: fullAddress,
      completionDate: formattedDate,
      issueDate: formattedDate,
      items: items,
      shippingCost: shippingCost
    };

    // Create PDF
    const pdfBuffer = await createInvoicePDF(invoiceData, invoiceNumber);
    
    // Upload to Drive
    const fileName = `Szamla_${invoiceNumber}.pdf`;
    await uploadToDrive(pdfBuffer, fileName);

    console.log(`✅ Invoice generated: ${invoiceNumber}`);
    return invoiceNumber;
  } catch (error) {
    console.error('⚠️ Invoice generation error:', error.message);
    throw error;
  }
}

// ============================================
// SAVE ORDER TO SHEETS (2026 MAGYAR MEZŐK!)
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
    
    // ADD ROW
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
      'Telefonszám': customerData.phone || '-'
    });
    
    console.log('✅ Sheets save OK - Order ID:', sessionId);
  } catch (error) {
    console.error('⚠️ Sheets save error:', error.message);
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
// MIDDLEWARE
// ============================================
app.use(cors());
app.use('/webhook/stripe', express.raw({type: 'application/json'}));
app.use(express.json());

// ============================================
// ROUTES
// ============================================

// Create Stripe payment session + IMMEDIATE SHEETS SAVE + INVOICE
app.post('/create-payment-session', async (req, res) => {
  const { cart, customerData } = req.body;

  try {
    const ebookIds = [2, 4, 300];
    const isEbook = cart.every(item => ebookIds.includes(item.id));

    // BUILD STRIPE LINE ITEMS
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

    // CREATE STRIPE SESSION
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

    // IMMEDIATE SAVE TO GOOGLE SHEETS
    await saveOrderToSheets(
      { cart, customerData }, 
      session.id
    );

    // GENERATE AND UPLOAD INVOICE TO DRIVE
    await generateAndSaveInvoice(
      { cart, customerData },
      session.id
    );

    // Response to frontend
    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('❌ Session/Sheets/Invoice error:', error);
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
    shipping: '$15.00'
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
╔═══════════════════════════════════════╗
║   🚀 SENKISEM SERVER STARTED (EN)    ║
╠═══════════════════════════════════════╣
║   Port: ${PORT}                       ║
║   Currency: USD ($)                   ║
║   Shipping: $15.00 (Home Delivery)    ║
╠═══════════════════════════════════════╣
║   ✅ Stripe + Webhook                ║
║   ✅ Google Sheets (MAGYAR mezők)    ║
║   ✅ IMMEDIATE save after checkout   ║
║   ✅ Auto PDF Invoice → Drive        ║
╚═══════════════════════════════════════╝
  `);
});