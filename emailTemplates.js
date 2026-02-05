/**
 * Email Templates Module
 * 
 * Contains 4 distinct email templates:
 * - Template A: Digital Product 1 (Notes From a Stranger - ID 2)
 * - Template B: Digital Product 2 (User Manual for Life - ID 4)
 * - Template C: Digital Bundle (Both ebooks - ID 300 or both ID 2 + ID 4)
 * - Template D: Physical Products
 */

const CONFIG = {
  BRAND_NAME: 'Senkisem',
  TAGLINE: 'Not a Brand; Message.',
  SUPPORT_EMAIL: process.env.RESEND_FROM_EMAIL || 'orders@senkisem.com',
  CURRENT_YEAR: new Date().getFullYear()
};

/**
 * Base email structure with header and footer
 */
function getEmailWrapper(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CONFIG.BRAND_NAME}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: #000000;
      padding: 40px 20px;
      text-align: center;
    }
    .header-logo {
      color: #ffffff;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 2px;
      margin: 0;
      text-transform: uppercase;
    }
    .footer {
      background-color: #1a1a1a;
      padding: 40px 20px;
      text-align: center;
      color: #ffffff;
    }
    .footer-brand {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .footer-tagline {
      font-size: 14px;
      color: #999999;
      font-style: italic;
      margin-top: 5px;
    }
    .footer-copyright {
      font-size: 12px;
      color: #666666;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <h1 class="header-logo">${CONFIG.BRAND_NAME}</h1>
    </div>
    
    <!-- Content -->
    ${content}
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-brand">${CONFIG.BRAND_NAME}</div>
      <div class="footer-tagline">${CONFIG.TAGLINE}</div>
      <div class="footer-copyright">© ${CONFIG.CURRENT_YEAR} ${CONFIG.BRAND_NAME} | All rights reserved</div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate product table rows
 */
function generateProductRows(cart) {
  return cart.map(item => {
    const quantity = item.quantity || 1;
    const price = typeof item.price === 'string' ? 
      parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price;
    const itemTotal = price * quantity;
    
    return `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #e5e5e5; color: #333;">${item.name}</td>
        <td style="padding: 15px; border-bottom: 1px solid #e5e5e5; text-align: center; color: #333;">${quantity}</td>
        <td style="padding: 15px; border-bottom: 1px solid #e5e5e5; text-align: right; color: #333; font-weight: 600;">$${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Download button component
 */
function getDownloadButton(downloadUrl, buttonText = 'Download Your Ebook') {
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${downloadUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: #ffffff; text-decoration: none; padding: 18px 50px; border-radius: 8px; 
                font-size: 18px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                transition: transform 0.2s;">
        📥 ${buttonText}
      </a>
    </div>
  `;
}

/**
 * TEMPLATE A: Digital Product 1 - Notes From a Stranger (ID 2)
 */
function templateDigitalProduct1(orderData, totalAmount, downloadLink) {
  const { customerData, cart } = orderData;
  const productRows = generateProductRows(cart);
  
  const content = `
    <div style="padding: 40px 30px;">
      <!-- Greeting -->
      <h2 style="color: #000000; font-size: 24px; margin-bottom: 10px;">Hi ${customerData.fullName}! 👋</h2>
      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        Thank you for your purchase! Your ebook <strong>"Notes From a Stranger"</strong> is ready for download.
      </p>
      
      <!-- Download Button -->
      ${getDownloadButton(downloadLink, 'Download "Notes From a Stranger"')}
      
      <!-- Warning Box -->
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ <strong>Important:</strong> This download link expires in <strong>7 days</strong> and can only be used <strong>once</strong>. 
          Please download your ebook now and save it to your device.
        </p>
      </div>
      
      <!-- Order Summary -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; margin: 30px 0;">
        <h3 style="color: #000000; font-size: 18px; margin-top: 0; margin-bottom: 20px;">Order Summary</h3>
        
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #000000;">
              <th style="padding: 15px; text-align: left; color: #ffffff; font-size: 14px;">Product</th>
              <th style="padding: 15px; text-align: center; color: #ffffff; font-size: 14px;">Qty</th>
              <th style="padding: 15px; text-align: right; color: #ffffff; font-size: 14px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 20px 15px; text-align: right; font-weight: 600; color: #000000; font-size: 16px;">Total:</td>
              <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: #667eea; font-size: 18px;">$${totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- Access Info -->
      <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1b5e20; font-size: 14px;">
          ✅ Your ebook is available for <strong>immediate download</strong>. You can read it on any device (phone, tablet, computer, e-reader).
        </p>
      </div>
      
      <!-- Invoice Info -->
      <div style="background-color: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a237e; font-size: 14px;">
          📄 Your official invoice is attached to this email as a PDF file.
        </p>
      </div>
      
      <!-- Support -->
      <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Need help? Contact us at <a href="mailto:${CONFIG.SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none; font-weight: 600;">${CONFIG.SUPPORT_EMAIL}</a>
      </p>
      
      <p style="color: #333333; font-size: 15px; margin-top: 30px;">
        Best regards,<br>
        <strong>The ${CONFIG.BRAND_NAME} Team</strong>
      </p>
    </div>
  `;
  
  return getEmailWrapper(content);
}

/**
 * TEMPLATE B: Digital Product 2 - User Manual for Life (ID 4)
 */
function templateDigitalProduct2(orderData, totalAmount, downloadLink) {
  const { customerData, cart } = orderData;
  const productRows = generateProductRows(cart);
  
  const content = `
    <div style="padding: 40px 30px;">
      <!-- Greeting -->
      <h2 style="color: #000000; font-size: 24px; margin-bottom: 10px;">Hi ${customerData.fullName}! 👋</h2>
      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        Thank you for your purchase! Your ebook <strong>"User Manual for Life"</strong> is ready for download.
      </p>
      
      <!-- Download Button -->
      ${getDownloadButton(downloadLink, 'Download "User Manual for Life"')}
      
      <!-- Warning Box -->
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ <strong>Important:</strong> This download link expires in <strong>7 days</strong> and can only be used <strong>once</strong>. 
          Please download your ebook now and save it to your device.
        </p>
      </div>
      
      <!-- Order Summary -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; margin: 30px 0;">
        <h3 style="color: #000000; font-size: 18px; margin-top: 0; margin-bottom: 20px;">Order Summary</h3>
        
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #000000;">
              <th style="padding: 15px; text-align: left; color: #ffffff; font-size: 14px;">Product</th>
              <th style="padding: 15px; text-align: center; color: #ffffff; font-size: 14px;">Qty</th>
              <th style="padding: 15px; text-align: right; color: #ffffff; font-size: 14px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 20px 15px; text-align: right; font-weight: 600; color: #000000; font-size: 16px;">Total:</td>
              <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: #667eea; font-size: 18px;">$${totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- Access Info -->
      <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1b5e20; font-size: 14px;">
          ✅ Your ebook is available for <strong>immediate download</strong>. You can read it on any device (phone, tablet, computer, e-reader).
        </p>
      </div>
      
      <!-- Invoice Info -->
      <div style="background-color: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a237e; font-size: 14px;">
          📄 Your official invoice is attached to this email as a PDF file.
        </p>
      </div>
      
      <!-- Support -->
      <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Need help? Contact us at <a href="mailto:${CONFIG.SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none; font-weight: 600;">${CONFIG.SUPPORT_EMAIL}</a>
      </p>
      
      <p style="color: #333333; font-size: 15px; margin-top: 30px;">
        Best regards,<br>
        <strong>The ${CONFIG.BRAND_NAME} Team</strong>
      </p>
    </div>
  `;
  
  return getEmailWrapper(content);
}

/**
 * TEMPLATE C: Digital Bundle - Both Ebooks (ID 300 or both ID 2 + ID 4)
 */
function templateDigitalBundle(orderData, totalAmount, downloadLinks) {
  const { customerData, cart } = orderData;
  const productRows = generateProductRows(cart);
  
  const content = `
    <div style="padding: 40px 30px;">
      <!-- Greeting -->
      <h2 style="color: #000000; font-size: 24px; margin-bottom: 10px;">Hi ${customerData.fullName}! 👋</h2>
      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        Thank you for your purchase! Your complete ebook collection is ready for download.
      </p>
      
      <!-- Download Buttons -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 30px; margin: 25px 0;">
        <h3 style="color: #000000; font-size: 18px; margin-top: 0; margin-bottom: 25px; text-align: center;">
          📚 Download Your Ebooks
        </h3>
        
        ${getDownloadButton(downloadLinks.product2, 'Download "Notes From a Stranger"')}
        
        <div style="text-align: center; margin: 20px 0; color: #999999; font-size: 14px;">
          ━━━━━━━━━━━━━━━━
        </div>
        
        ${getDownloadButton(downloadLinks.product4, 'Download "User Manual for Life"')}
      </div>
      
      <!-- Warning Box -->
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ <strong>Important:</strong> Each download link expires in <strong>7 days</strong> and can only be used <strong>once</strong>. 
          Please download both ebooks now and save them to your device.
        </p>
      </div>
      
      <!-- Order Summary -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; margin: 30px 0;">
        <h3 style="color: #000000; font-size: 18px; margin-top: 0; margin-bottom: 20px;">Order Summary</h3>
        
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #000000;">
              <th style="padding: 15px; text-align: left; color: #ffffff; font-size: 14px;">Product</th>
              <th style="padding: 15px; text-align: center; color: #ffffff; font-size: 14px;">Qty</th>
              <th style="padding: 15px; text-align: right; color: #ffffff; font-size: 14px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 20px 15px; text-align: right; font-weight: 600; color: #000000; font-size: 16px;">Total:</td>
              <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: #667eea; font-size: 18px;">$${totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- Access Info -->
      <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1b5e20; font-size: 14px;">
          ✅ Your ebooks are available for <strong>immediate download</strong>. You can read them on any device (phone, tablet, computer, e-reader).
        </p>
      </div>
      
      <!-- Invoice Info -->
      <div style="background-color: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a237e; font-size: 14px;">
          📄 Your official invoice is attached to this email as a PDF file.
        </p>
      </div>
      
      <!-- Support -->
      <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Need help? Contact us at <a href="mailto:${CONFIG.SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none; font-weight: 600;">${CONFIG.SUPPORT_EMAIL}</a>
      </p>
      
      <p style="color: #333333; font-size: 15px; margin-top: 30px;">
        Best regards,<br>
        <strong>The ${CONFIG.BRAND_NAME} Team</strong>
      </p>
    </div>
  `;
  
  return getEmailWrapper(content);
}

/**
 * TEMPLATE D: Physical Products
 */
function templatePhysicalProduct(orderData, totalAmount) {
  const { customerData, cart } = orderData;
  const productRows = generateProductRows(cart);
  
  const content = `
    <div style="padding: 40px 30px;">
      <!-- Greeting -->
      <h2 style="color: #000000; font-size: 24px; margin-bottom: 10px;">Hi ${customerData.fullName}! 👋</h2>
      <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        Thank you for your order! We have successfully received your purchase and payment.
      </p>
      
      <!-- Order Processing Info -->
      <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; margin: 25px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 15px 0; color: #0d47a1; font-size: 16px;">📦 Order Status: Processing</h3>
        <p style="margin: 5px 0; color: #1565c0; font-size: 14px;">
          ✓ Your order is being prepared for shipment
        </p>
        <p style="margin: 5px 0; color: #1565c0; font-size: 14px;">
          ✓ Average delivery time: <strong>7-10 business days</strong>
        </p>
        <p style="margin: 5px 0; color: #1565c0; font-size: 14px;">
          ✓ Delivery may take up to <strong>14-28 days</strong> depending on your location
        </p>
      </div>
      
      <!-- Shipping Address -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h3 style="color: #000000; font-size: 16px; margin-top: 0; margin-bottom: 15px;">📍 Shipping Address</h3>
        <p style="margin: 5px 0; color: #333333; font-size: 14px;">
          ${customerData.fullName}<br>
          ${customerData.address}<br>
          ${customerData.zip} ${customerData.city}<br>
          ${customerData.country}
        </p>
        ${customerData.phone ? `<p style="margin: 15px 0 5px 0; color: #666666; font-size: 13px;">Phone: ${customerData.phone}</p>` : ''}
      </div>
      
      <!-- Order Summary -->
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 25px; margin: 30px 0;">
        <h3 style="color: #000000; font-size: 18px; margin-top: 0; margin-bottom: 20px;">Order Summary</h3>
        
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 6px; overflow: hidden;">
          <thead>
            <tr style="background-color: #000000;">
              <th style="padding: 15px; text-align: left; color: #ffffff; font-size: 14px;">Product</th>
              <th style="padding: 15px; text-align: center; color: #ffffff; font-size: 14px;">Qty</th>
              <th style="padding: 15px; text-align: right; color: #ffffff; font-size: 14px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 20px 15px; text-align: right; font-weight: 600; color: #000000; font-size: 16px;">Total:</td>
              <td style="padding: 20px 15px; text-align: right; font-weight: 700; color: #667eea; font-size: 18px;">$${totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <!-- Tracking Info -->
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          📬 You will receive a <strong>separate email with tracking information</strong> once your order has been shipped.
        </p>
      </div>
      
      <!-- Invoice Info -->
      <div style="background-color: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
        <p style="margin: 0; color: #1a237e; font-size: 14px;">
          📄 Your official invoice is attached to this email as a PDF file.
        </p>
      </div>
      
      <!-- Support -->
      <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        Need help? Contact us at <a href="mailto:${CONFIG.SUPPORT_EMAIL}" style="color: #667eea; text-decoration: none; font-weight: 600;">${CONFIG.SUPPORT_EMAIL}</a>
      </p>
      
      <p style="color: #333333; font-size: 15px; margin-top: 30px;">
        Best regards,<br>
        <strong>The ${CONFIG.BRAND_NAME} Team</strong>
      </p>
    </div>
  `;
  
  return getEmailWrapper(content);
}

/**
 * Determine which template to use based on cart contents
 */
function determineEmailTemplate(cart) {
  const hasProduct2 = cart.some(item => item.id === 2);
  const hasProduct4 = cart.some(item => item.id === 4);
  const hasBundle = cart.some(item => item.id === 300);
  const hasPhysical = cart.some(item => ![2, 4, 300].includes(item.id));
  
  // Priority order:
  if (hasPhysical) return 'physicalProduct';
  if (hasBundle || (hasProduct2 && hasProduct4)) return 'digitalBundle';
  if (hasProduct2) return 'digitalProduct1';
  if (hasProduct4) return 'digitalProduct2';
  
  return 'physicalProduct'; // fallback
}

/**
 * Generate email based on template type
 */
function generateEmail(templateType, orderData, totalAmount, downloadLinks = null) {
  switch (templateType) {
    case 'digitalProduct1':
      return {
        subject: '✅ Your Ebook is Ready - Senkisem.com',
        html: templateDigitalProduct1(orderData, totalAmount, downloadLinks)
      };
    
    case 'digitalProduct2':
      return {
        subject: '✅ Your Ebook is Ready - Senkisem.com',
        html: templateDigitalProduct2(orderData, totalAmount, downloadLinks)
      };
    
    case 'digitalBundle':
      return {
        subject: '✅ Your Ebooks are Ready - Senkisem.com',
        html: templateDigitalBundle(orderData, totalAmount, downloadLinks)
      };
    
    case 'physicalProduct':
      return {
        subject: '✅ Order Confirmed - Senkisem.com',
        html: templatePhysicalProduct(orderData, totalAmount)
      };
    
    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }
}

module.exports = {
  determineEmailTemplate,
  generateEmail,
  templateDigitalProduct1,
  templateDigitalProduct2,
  templateDigitalBundle,
  templatePhysicalProduct
};