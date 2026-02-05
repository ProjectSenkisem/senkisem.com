/**
 * Download Link Service
 * 
 * Handles:
 * - UUID token generation
 * - Google Sheets storage (Download_Links tab)
 * - Token validation
 * - Download tracking
 * - Security features (IP logging, one-time use, expiry)
 */

const { v4: uuidv4 } = require('uuid');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const DOWNLOAD_LINKS_SHEET_ID = '1ysbyF0uCl1W03aGArpFYDIU6leFFRJb0R1AaadVarGk';
const DOWNLOAD_LINKS_TAB_NAME = 'Download_Links';
const LINK_EXPIRY_DAYS = 7;

/**
 * Get Google Auth
 */
function getGoogleAuth() {
  return new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Get or create Download_Links sheet
 */
async function getDownloadLinksSheet() {
  try {
    const doc = new GoogleSpreadsheet(DOWNLOAD_LINKS_SHEET_ID, getGoogleAuth());
    await doc.loadInfo();
    
    let sheet = doc.sheetsByTitle[DOWNLOAD_LINKS_TAB_NAME];
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      console.log('📋 Creating Download_Links sheet...');
      sheet = await doc.addSheet({
        title: DOWNLOAD_LINKS_TAB_NAME,
        headerValues: [
          'Token',
          'Email',
          'Product_IDs',
          'Created',
          'Used',
          'Expiry',
          'IP_Address',
          'Download_Date',
          'Invoice_Number'
        ]
      });
      console.log('✅ Download_Links sheet created');
    }
    
    return sheet;
  } catch (error) {
    console.error('❌ Download_Links sheet error:', error);
    throw error;
  }
}

/**
 * Generate download token and save to Google Sheets
 */
async function generateDownloadToken(email, productId, invoiceNumber) {
  try {
    const token = uuidv4();
    const created = new Date().toISOString();
    const expiry = new Date(Date.now() + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    
    const sheet = await getDownloadLinksSheet();
    
    await sheet.addRow({
      'Token': token,
      'Email': email,
      'Product_IDs': String(productId),
      'Created': created,
      'Used': 'FALSE',
      'Expiry': expiry,
      'IP_Address': '',
      'Download_Date': '',
      'Invoice_Number': invoiceNumber
    });
    
    console.log(`✅ Download token generated for product ${productId}:`, token.substring(0, 8) + '...');
    
    return token;
    
  } catch (error) {
    console.error('❌ Token generation error:', error);
    throw error;
  }
}

/**
 * Generate download links for order
 */
async function generateDownloadLinks(cart, email, invoiceNumber, domain) {
  try {
    const links = {};
    
    // Check what products need download links
    const hasProduct2 = cart.some(item => item.id === 2);
    const hasProduct4 = cart.some(item => item.id === 4);
    const hasBundle = cart.some(item => item.id === 300);
    
    // Generate tokens
    if (hasProduct2 || hasBundle) {
      const token2 = await generateDownloadToken(email, 2, invoiceNumber);
      links.product2 = `${domain}/download/${token2}`;
    }
    
    if (hasProduct4 || hasBundle) {
      const token4 = await generateDownloadToken(email, 4, invoiceNumber);
      links.product4 = `${domain}/download/${token4}`;
    }
    
    console.log('✅ Download links generated:', Object.keys(links));
    
    return links;
    
  } catch (error) {
    console.error('❌ Download link generation error:', error);
    throw error;
  }
}

/**
 * Validate download token
 */
async function validateDownloadToken(token, ipAddress) {
  try {
    const sheet = await getDownloadLinksSheet();
    const rows = await sheet.getRows();
    
    // Find token
    const tokenRow = rows.find(row => row.get('Token') === token);
    
    if (!tokenRow) {
      return {
        valid: false,
        reason: 'invalid',
        message: 'Download link not found. Please check your email for the correct link.'
      };
    }
    
    // Check if already used
    if (tokenRow.get('Used') === 'TRUE') {
      return {
        valid: false,
        reason: 'already-used',
        message: 'This download link has already been used. Each link can only be used once.',
        usedDate: tokenRow.get('Download_Date')
      };
    }
    
    // Check expiry
    const expiry = new Date(tokenRow.get('Expiry'));
    const now = new Date();
    
    if (now > expiry) {
      return {
        valid: false,
        reason: 'expired',
        message: `This download link expired on ${expiry.toLocaleDateString()}. Please contact support.`,
        expiryDate: expiry.toISOString()
      };
    }
    
    // Valid token
    return {
      valid: true,
      productId: parseInt(tokenRow.get('Product_IDs')),
      email: tokenRow.get('Email'),
      tokenRow: tokenRow,
      ipAddress: ipAddress
    };
    
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return {
      valid: false,
      reason: 'server-error',
      message: 'Server error during validation. Please try again or contact support.'
    };
  }
}

/**
 * Mark token as used
 */
async function markTokenAsUsed(tokenRow, ipAddress) {
  try {
    tokenRow.set('Used', 'TRUE');
    tokenRow.set('IP_Address', ipAddress);
    tokenRow.set('Download_Date', new Date().toISOString());
    
    await tokenRow.save();
    
    console.log('✅ Token marked as used');
    
  } catch (error) {
    console.error('❌ Token update error:', error);
    throw error;
  }
}

/**
 * Get product file path
 */
function getProductFilePath(productId) {
  const fileMap = {
    2: './ebooks/product_2.pdf',
    4: './ebooks/product_4.pdf'
  };
  
  return fileMap[productId] || null;
}

/**
 * Get product file name for download
 */
function getProductFileName(productId) {
  const nameMap = {
    2: 'Senkisem_Notes_From_a_Stranger.pdf',
    4: 'Senkisem_User_Manual_for_Life.pdf'
  };
  
  return nameMap[productId] || 'ebook.pdf';
}

module.exports = {
  generateDownloadToken,
  generateDownloadLinks,
  validateDownloadToken,
  markTokenAsUsed,
  getProductFilePath,
  getProductFileName,
  LINK_EXPIRY_DAYS
};