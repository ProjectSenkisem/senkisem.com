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
    HOME_DELIVERY_COST: 1500, // $15.00 in cents
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
  return doc.sheetsByIndex[0];
}

// ============================================
// SAVE ORDER TO SHEETS
// ============================================
async function saveOrder(orderData) {
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    
    const totalAmount = orderData.items.reduce((sum, i) => sum + i.price, 0);
    const isEbook = orderData.items.some(i => i.id === 2 || i.id === 4 || i.id === 300);
    
    // Determine shipping details
    let shippingMethod = 'Digital Download';
    let shippingAddress = 'Email Delivery';
    let shippingCost = 0;
    
    if (!isEbook) {
      shippingMethod = 'Home Delivery';
      shippingAddress = orderData.shippingAddress || 'N/A';
      shippingCost = orderData.shippingCost;
    }
    
    await sheet.addRow({
      'Date': new Date().toLocaleString('en-US'),
      'Name': orderData.customerName,
      'Email': orderData.customerEmail,
      'Phone': orderData.phone || 'N/A',
      'Billing Address': orderData.billingAddress || 'N/A',
      'City': orderData.customerCity || 'N/A',
      'ZIP Code': orderData.customerZip || 'N/A',
      'Country': orderData.customerCountry || 'N/A',
      'Products': orderData.items.map(i => i.name).join(', '),
      'Product Sizes': orderData.items.map(i => i.size || 'N/A').join(', '),
      'Amount': `$${(totalAmount / 100).toFixed(2)}`,
      'Type': isEbook ? 'E-book' : 'Physical Product',
      'Shipping Method': shippingMethod,
      'Delivery Address': shippingAddress,
      'Shipping Cost': `$${(shippingCost / 100).toFixed(2)}`,
      'Total': `$${((totalAmount + shippingCost) / 100).toFixed(2)}`,
      'Order ID': orderData.sessionId,
      'Status': 'Paid',
      'Delivery Note': orderData.deliveryNote || ''
    });
    
    console.log('✅ Order saved to Sheets');
  } catch (error) {
    console.error('⚠️ Sheets error:', error.message);
  }
}

// ============================================
// WEBHOOK - MUST BE BEFORE express.json()!
// ============================================
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  console.log('✅ Payment completed:', session.id);

  try {
    // 1. Get line items
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    const items = lineItems.data.map(item => ({
      id: parseInt(item.price.metadata?.productId || 0),
      name: item.description,
      price: item.amount_total, // in cents
      quantity: item.quantity,
      size: item.price.metadata?.size || 'N/A'
    }));

    // 2. Separate shipping from products
    const shippingItem = items.find(i => 
      i.name.includes('Home Delivery')
    );
    const productItems = items.filter(i => 
      !i.name.includes('Home Delivery')
    );

    // 3. Build order data
    const orderData = {
      sessionId: session.id,
      customerName: session.metadata.customerName || 'Unknown',
      customerEmail: session.customer_email,
      billingAddress: session.metadata.customerAddress || '',
      customerCity: session.metadata.customerCity || '',
      customerZip: session.metadata.customerZip || '',
      customerCountry: session.metadata.customerCountry || '',
      phone: session.metadata.customerPhone || '',
      items: productItems,
      shippingCost: shippingItem?.price || 0,
      shippingAddress: session.metadata.deliveryAddress || '',
      deliveryNote: session.metadata.deliveryNote || ''
    };

    // 4. Save to Sheets
    await saveOrder(orderData);

    console.log('✅ Order processed:', session.id);
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
  }

  res.json({ received: true });
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// ============================================
// ROUTES
// ============================================

// Create Stripe payment session
app.post('/create-payment-session', async (req, res) => {
  const { cart, customerData } = req.body;

  if (!Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  if (!customerData) {
    return res.status(400).json({ error: 'Missing customer data' });
  }

  try {
    // Check if order contains only e-books
    const isOnlyEbook = cart.every(item => 
      parseInt(item.id) === 2 || 
      parseInt(item.id) === 4 || 
      parseInt(item.id) === 300
    );

    // Build Stripe line items
    const lineItems = cart.map(item => {
      const product = products.find(p => p.id === parseInt(item.id));
      if (!product) throw new Error(`Product not found: ${item.id}`);
      
      return {
        price_data: {
          currency: 'usd',
          product_data: { 
            name: product.name,
            metadata: { 
              productId: product.id.toString(),
              size: item.size || 'N/A'
            }
          },
          unit_amount: Math.round(product.price * 100), // Convert to cents
        },
        quantity: item.quantity || 1,
      };
    });

    // Add shipping for physical products
    if (!isOnlyEbook) {
      const deliveryAddr = customerData.deliveryAddress || customerData.address || '';
      const deliveryCity = customerData.deliveryCity || customerData.city || '';
      const deliveryZip = customerData.deliveryZip || customerData.zip || '';
      const deliveryCountry = customerData.deliveryCountry || customerData.country || '';
      
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { 
            name: 'Home Delivery',
            description: `Delivery to: ${deliveryZip} ${deliveryCity}, ${deliveryAddr}, ${deliveryCountry}`
          },
          unit_amount: CONFIG.SHIPPING.HOME_DELIVERY_COST,
        },
        quantity: 1,
      });
    }

    // Choose success URL based on order type
    const successUrl = isOnlyEbook 
      ? `${process.env.DOMAIN}/success2.html?session_id={CHECKOUT_SESSION_ID}`
      : `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`;

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: `${process.env.DOMAIN}/cancel.html`,
      metadata: {
        customerName: customerData.fullName,
        customerEmail: customerData.email,
        customerAddress: customerData.address || '',
        customerCity: customerData.city || '',
        customerZip: customerData.zip || '',
        customerCountry: customerData.country || '',
        customerPhone: customerData.phone || '',
        deliveryAddress: !isOnlyEbook 
          ? `${customerData.deliveryZip || customerData.zip || ''} ${customerData.deliveryCity || customerData.city || ''}, ${customerData.deliveryAddress || customerData.address || ''}, ${customerData.deliveryCountry || customerData.country || ''}`
          : 'Digital Download',
        deliveryNote: customerData.deliveryNote || '',
        orderType: isOnlyEbook ? 'ebook' : 'physical'
      },
      customer_email: customerData.email,
    });

    console.log('✅ Stripe session created:', session.id);
    res.json({ payment_url: session.url });

  } catch (error) {
    console.error('❌ Session creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    currency: 'USD',
    shipping: {
      homeDelivery: '$15.00'
    }
  });
});

// ============================================
// STATIC FILES
// ============================================
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/img', express.static(path.join(__dirname, 'public/img')));
app.use(express.static(path.join(__dirname, 'dist')));

// SPA routing - React Router support
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// SERVER START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║       🚀 SENKISEM SERVER STARTED                  ║
╠════════════════════════════════════════════════════╣
║  Port:                ${PORT}                      ║
║  URL:                 http://localhost:${PORT}     ║
║  Currency:            USD ($)                      ║
║  Shipping:            $15.00 (Home Delivery)       ║
╠════════════════════════════════════════════════════╣
║  ✅ Stripe integration:        Active              ║
║  ✅ Google Sheets:             Active              ║
║  ✅ Webhook handling:          Active              ║
╠════════════════════════════════════════════════════╣
║  📦 E-book orders:             Supported           ║
║  📦 Physical products:         Supported           ║
║  🏠 Home delivery:             $15.00              ║
╚════════════════════════════════════════════════════╝
  `);
});