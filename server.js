require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// ============================================
// LOGGING UTILITY
// ============================================
const log = {
  info: (msg, data = null) => {
    console.log(`ℹ️  [INFO] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  success: (msg, data = null) => {
    console.log(`✅ [SUCCESS] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  error: (msg, error = null) => {
    console.error(`❌ [ERROR] ${msg}`);
    if (error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  },
  warn: (msg, data = null) => {
    console.warn(`⚠️  [WARNING] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  debug: (msg, data = null) => {
    console.log(`🔍 [DEBUG] ${msg}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }
};

// ============================================
// ENV VALIDATION
// ============================================
log.info('Starting environment validation...');

const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'DOMAIN'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  log.error(`Missing environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

log.success('Environment variables validated');
log.debug('Environment config', {
  DOMAIN: process.env.DOMAIN,
  STRIPE_KEY_PREFIX: process.env.STRIPE_SECRET_KEY?.substring(0, 10) + '...',
  GOOGLE_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
});

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

log.info('Configuration loaded', CONFIG);

// ============================================
// LOAD PRODUCTS
// ============================================
let products = [];
try {
  log.info('Loading products from product.json...');
  const data = fs.readFileSync(path.join(__dirname, 'product.json'), 'utf8');
  products = JSON.parse(data).products || JSON.parse(data);
  log.success(`${products.length} products loaded`, products.map(p => ({ id: p.id, name: p.name, price: p.price })));
} catch (err) {
  log.error('Failed to load product.json', err);
  process.exit(1);
}

// ============================================
// GOOGLE CLIENT SETUP
// ============================================
function getGoogleAuth() {
  log.debug('Creating Google JWT authentication...');
  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    log.success('Google JWT created successfully');
    return auth;
  } catch (error) {
    log.error('Failed to create Google JWT', error);
    throw error;
  }
}

async function getSheet(sheetId) {
  log.info(`Accessing Google Sheet: ${sheetId}...`);
  try {
    const doc = new GoogleSpreadsheet(sheetId, getGoogleAuth());
    await doc.loadInfo();
    log.success(`Sheet loaded: ${doc.title}`);
    log.debug('Sheet details', {
      title: doc.title,
      sheetCount: doc.sheetCount,
      firstSheetTitle: doc.sheetsByIndex[0]?.title
    });
    return doc.sheetsByIndex[0];
  } catch (error) {
    log.error('Failed to load Google Sheet', error);
    throw error;
  }
}

// ============================================
// SAVE ORDER TO SHEETS
// ============================================
async function saveOrder(orderData) {
  log.info('Starting order save process...');
  log.debug('Order data received', orderData);
  
  try {
    const sheet = await getSheet(CONFIG.SHEETS.ORDERS);
    
    const totalAmount = orderData.items.reduce((sum, i) => sum + i.price, 0);
    const isEbook = orderData.items.some(i => i.id === 2 || i.id === 4 || i.id === 300);
    
    log.debug('Order calculation', {
      totalAmount,
      isEbook,
      itemCount: orderData.items.length
    });
    
    // Determine shipping details
    let shippingMethod = 'Digital Download';
    let shippingAddress = 'Email Delivery';
    let shippingCost = 0;
    
    if (!isEbook) {
      shippingMethod = 'Home Delivery';
      shippingAddress = orderData.shippingAddress || 'N/A';
      shippingCost = orderData.shippingCost;
    }
    
    const rowData = {
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
    };
    
    log.debug('Row data to be saved', rowData);
    
    await sheet.addRow(rowData);
    
    log.success('Order saved to Google Sheets successfully', {
      orderId: orderData.sessionId,
      customer: orderData.customerEmail,
      total: `$${((totalAmount + shippingCost) / 100).toFixed(2)}`
    });
  } catch (error) {
    log.error('Failed to save order to Google Sheets', error);
    throw error;
  }
}

// ============================================
// WEBHOOK - MUST BE BEFORE express.json()!
// ============================================
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  log.info('Webhook received from Stripe');
  
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    log.debug('Verifying webhook signature...');
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    log.success('Webhook signature verified', { eventType: event.type, eventId: event.id });
  } catch (err) {
    log.error('Webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    log.info(`Ignoring event type: ${event.type}`);
    return res.json({ received: true });
  }

  const session = event.data.object;
  log.success('Payment completed', { sessionId: session.id, amount: session.amount_total });
  log.debug('Session details', {
    id: session.id,
    customer_email: session.customer_email,
    amount_total: session.amount_total,
    metadata: session.metadata
  });

  try {
    // 1. Get line items
    log.info('Fetching line items from Stripe...');
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
    log.debug('Line items received', lineItems.data);
    
    const items = lineItems.data.map(item => ({
      id: parseInt(item.price.metadata?.productId || 0),
      name: item.description,
      price: item.amount_total, // in cents
      quantity: item.quantity,
      size: item.price.metadata?.size || 'N/A'
    }));
    
    log.debug('Parsed items', items);

    // 2. Separate shipping from products
    const shippingItem = items.find(i => 
      i.name.includes('Home Delivery')
    );
    const productItems = items.filter(i => 
      !i.name.includes('Home Delivery')
    );
    
    log.debug('Separated items', {
      shippingItem,
      productItems,
      productCount: productItems.length
    });

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
    
    log.debug('Order data constructed', orderData);

    // 4. Save to Sheets
    log.info('Saving order to Google Sheets...');
    await saveOrder(orderData);

    log.success('Order processed successfully', { sessionId: session.id });
    
  } catch (error) {
    log.error('Webhook processing failed', error);
    // Don't throw - we still return 200 to Stripe
  }

  res.json({ received: true });
});

// ============================================
// MIDDLEWARE
// ============================================
log.info('Setting up middleware...');
app.use(cors());
app.use(express.json());
log.success('Middleware configured');

// ============================================
// ROUTES
// ============================================

// Create Stripe payment session
app.post('/create-payment-session', async (req, res) => {
  log.info('Payment session creation requested');
  log.debug('Request body', req.body);
  
  const { cart, customerData } = req.body;

  if (!Array.isArray(cart) || cart.length === 0) {
    log.warn('Cart is empty or invalid', { cart });
    return res.status(400).json({ error: 'Cart is empty' });
  }

  if (!customerData) {
    log.warn('Customer data missing');
    return res.status(400).json({ error: 'Missing customer data' });
  }

  try {
    // Check if order contains only e-books
    const isOnlyEbook = cart.every(item => 
      parseInt(item.id) === 2 || 
      parseInt(item.id) === 4 || 
      parseInt(item.id) === 300
    );
    
    log.debug('Order type analysis', {
      isOnlyEbook,
      cartItems: cart.map(i => ({ id: i.id, quantity: i.quantity, size: i.size }))
    });

    // Build Stripe line items
    log.info('Building Stripe line items...');
    const lineItems = cart.map(item => {
      const product = products.find(p => p.id === parseInt(item.id));
      if (!product) {
        log.error(`Product not found: ${item.id}`);
        throw new Error(`Product not found: ${item.id}`);
      }
      
      log.debug('Product found', { id: product.id, name: product.name, price: product.price });
      
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
      
      log.info('Adding home delivery shipping', {
        address: deliveryAddr,
        city: deliveryCity,
        zip: deliveryZip,
        country: deliveryCountry
      });
      
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
    
    log.debug('Final line items', lineItems);

    // Choose success URL based on order type
    const successUrl = isOnlyEbook 
      ? `${process.env.DOMAIN}/success2.html?session_id={CHECKOUT_SESSION_ID}`
      : `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    
    log.info('Success URL selected', { successUrl, isOnlyEbook });

    // Create Stripe session
    log.info('Creating Stripe checkout session...');
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

    log.success('Stripe session created successfully', {
      sessionId: session.id,
      paymentUrl: session.url,
      amount: session.amount_total
    });
    
    res.json({ payment_url: session.url });

  } catch (error) {
    log.error('Session creation failed', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  log.info('Health check requested');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    currency: 'USD',
    shipping: {
      homeDelivery: '$15.00'
    },
    environment: {
      nodeVersion: process.version,
      port: PORT
    }
  });
});

// ============================================
// STATIC FILES
// ============================================
log.info('Setting up static file serving...');
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/img', express.static(path.join(__dirname, 'public/img')));
app.use(express.static(path.join(__dirname, 'dist')));
log.success('Static file routes configured');

// SPA routing - React Router support
app.get('*', (req, res) => {
  log.debug('SPA route requested', { path: req.path });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception', error);
  process.exit(1);
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
║  Environment:         ${process.env.NODE_ENV || 'development'}
║  Node Version:        ${process.version}           ║
║  Currency:            USD ($)                      ║
║  Shipping:            $15.00 (Home Delivery)       ║
╠════════════════════════════════════════════════════╣
║  ✅ Stripe integration:        Active              ║
║  ✅ Google Sheets:             Active              ║
║  ✅ Webhook handling:          Active              ║
║  ✅ Detailed logging:          Active              ║
╠════════════════════════════════════════════════════╣
║  📦 E-book orders:             Supported           ║
║  📦 Physical products:         Supported           ║
║  🏠 Home delivery:             $15.00              ║
╚════════════════════════════════════════════════════╝
  `);
  
  log.success('Server started successfully', {
    port: PORT,
    productCount: products.length,
    environment: process.env.NODE_ENV || 'development'
  });
});