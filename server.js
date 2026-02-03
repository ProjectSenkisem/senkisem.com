require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ============================================
// ENV VALIDATION
// ============================================
const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'DOMAIN'
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
  
  // ✅ NÉV ALAPJÁN KERESÉS
  const sheet = doc.sheetsByTitle['2026'];
  
  if (!sheet) {
    throw new Error('❌ 2026 worksheet not found!');
  }
  
  console.log(`✅ Worksheet loaded: ${sheet.title}`);
  return sheet;
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
    const productType = isEbook ? 'E-könyv' : 'Fizikai'; // ✅ Magyar
    
    // Shipping method text
    let shippingMethodText = '-';
    if (customerData.shippingMethod === 'home') {
      shippingMethodText = 'Házhozszállítás'; // ✅ Magyar
    } else if (customerData.shippingMethod === 'digital') {
      shippingMethodText = 'Digitális'; // ✅ Magyar
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
    
    // ✅ ADD ROW - MAGYAR MEZŐNEVEK!
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
      'Csomagpont név': '-', // Nincs használva nemzetközi szállításnál
      'Szállítási díj': `$${shippingCost.toFixed(2)}`,
      'Végösszeg': `$${totalAmount.toFixed(2)}`,
      'Foxpost követés': '-', // Nincs használva
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

// Create Stripe payment session + IMMEDIATE SHEETS SAVE
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

    // ✅ IMMEDIATE SAVE TO GOOGLE SHEETS (before payment)
    await saveOrderToSheets(
      { cart, customerData }, 
      session.id
    );

    // ✅ Response to frontend
    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('❌ Session/Sheets error:', error);
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
        orderRow.set('Státusz', 'Fizetve'); // ✅ Magyar
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
╚═══════════════════════════════════════╝
  `);
});