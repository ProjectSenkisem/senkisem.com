// ─────────────────────────────────────────────
//  idModalService.js — PROXY VERSION (CORS-free)
//  Does NOT call the Resend API directly,
//  instead routes through the server: /api/id-modal-email
// ─────────────────────────────────────────────

const ID_MODAL_API = '/api/id-modal-email';

// ─────────────────────────────────────────────
//  HELPER: File → base64
// ─────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({
      base64: reader.result.split(',')[1],
      name:   file.name || 'image.jpg',
    });
    reader.onerror = () => reject(new Error('File read error: ' + file.name));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
//  HTML BUILDERS
// ─────────────────────────────────────────────

function buildAnswerTableHTML(answers) {
  const LABELS = {
    q1:          'Who are you when no one sees you?',
    q2:          'If your face disappeared, what would remain?',
    q3:          'Have you ever felt like a stranger to yourself?',
    q4:          'What bothers you more?',
    q5:          'Would you rather be…',
    q6:          'This piece is more of a…',
    q7:          'What should we work with?',
    uploadCount: 'Number of uploaded images',
    q9:          'Which distortion?',
    q10:         'More…',
    q13:         'Selected product',
    size:        'Selected size',
    q14:         'For you this is a…',
    q15:         'If someone asks: "is that you?"',
    q16:         'You are more…',
  };

  const rows = Object.entries(LABELS)
    .map(([key, label]) => {
      const val = answers[key];
      if (!val && val !== 0) return '';
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;color:#555;font-size:13px;width:45%;vertical-align:top;">
            ${label}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;color:#111;font-size:13px;font-weight:600;vertical-align:top;">
            ${val}
          </td>
        </tr>`;
    })
    .filter(Boolean)
    .join('');

  if (!rows) return '<p style="color:#999;font-size:13px;">No answers received.</p>';

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#000;">
          <th style="padding:12px 14px;text-align:left;color:#fff;font-size:12px;letter-spacing:.06em;text-transform:uppercase;">Question</th>
          <th style="padding:12px 14px;text-align:left;color:#fff;font-size:12px;letter-spacing:.06em;text-transform:uppercase;">Answer</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildAdminEmailHTML(answers, uploadedFilesCount, isCheckout) {
  const now     = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Budapest' });
  const product = answers.q13 || '—';
  const size    = answers.size || '—';
  const intent  = isCheckout ? '🛒 WANTS TO ORDER' : '⏳ WILL ORDER LATER';
  const email   = answers.contactEmail || '—';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body{margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background:#f5f5f5;}
    .wrap{max-width:640px;margin:0 auto;background:#fff;}
    .hdr{background:#000;padding:32px 24px;text-align:center;}
    .hdr h1{color:#fff;font-size:22px;letter-spacing:2px;margin:0;text-transform:uppercase;}
    .hdr p{color:rgba(255,255,255,.55);font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:6px 0 0;}
    .body{padding:32px 28px;}
    .badge{display:inline-block;padding:6px 14px;border-radius:3px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px;}
    .badge.checkout{background:#e8f5e9;color:#1b5e20;border:1px solid #a5d6a7;}
    .badge.later{background:#fff8e1;color:#6d4c00;border:1px solid #ffe082;}
    h2{font-size:16px;color:#000;margin:28px 0 12px;border-bottom:1px solid #eee;padding-bottom:8px;}
    .meta{background:#f9f9f9;border-radius:6px;padding:16px 18px;margin-bottom:24px;font-size:13px;color:#333;line-height:1.7;}
    .meta strong{color:#000;}
    .ftr{background:#111;padding:28px 24px;text-align:center;color:#fff;font-size:12px;letter-spacing:.1em;text-transform:uppercase;}
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>ID: Senkisem — New Submission</h1>
    <p>${now}</p>
  </div>
  <div class="body">
    <span class="badge ${isCheckout ? 'checkout' : 'later'}">${intent}</span>

    <div class="meta">
      <strong>Product:</strong> ${product}<br>
      <strong>Size:</strong>    ${size}<br>
      ${email !== '—' ? `<strong>Email:</strong> ${email}<br>` : ''}
      <strong>Uploaded images:</strong> ${uploadedFilesCount} pcs
    </div>

    <h2>All answers</h2>
    ${buildAnswerTableHTML(answers)}

    ${uploadedFilesCount > 0 ? `
    <h2 style="margin-top:32px;">Attached images</h2>
    <p style="font-size:13px;color:#666;">
      ${uploadedFilesCount} image(s) attached to this email (see: attachments).
    </p>` : ''}
  </div>
  <div class="ftr">Senkisem &nbsp;|&nbsp; ID Submission Notification</div>
</div>
</body>
</html>`;
}

function buildConfirmationEmailHTML(customerEmail) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body{margin:0;padding:0;font-family:'Segoe UI',Tahoma,sans-serif;background:#f5f5f5;}
    .wrap{max-width:600px;margin:0 auto;background:#fff;}
    .hdr{background:#000;padding:40px 24px;text-align:center;}
    .hdr h1{color:#fff;font-size:28px;letter-spacing:3px;margin:0;text-transform:uppercase;}
    .hdr p{color:rgba(255,255,255,.45);font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin:8px 0 0;}
    .body{padding:40px 32px;}
    .icon{font-size:40px;text-align:center;margin-bottom:20px;}
    h2{color:#000;font-size:20px;line-height:1.3;margin:0 0 16px;}
    p{color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;}
    .box{background:#f9f9f9;border-left:3px solid #000;padding:16px 20px;border-radius:0 4px 4px 0;margin:28px 0;}
    .box p{margin:0;font-size:13px;color:#333;}
    .ftr{background:#111;padding:32px 24px;text-align:center;}
    .ftr span{color:rgba(255,255,255,.4);font-size:11px;letter-spacing:.12em;text-transform:uppercase;}
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>Senkisem</h1>
    <p>Not a brand. A message.</p>
  </div>
  <div class="body">
    <div class="icon">✅</div>
    <h2>We received your details!</h2>
    <p>
      Thank you for filling out the ID: Senkisem questionnaire.<br>
      We will be in touch soon with your unique distorted identity.
    </p>
    <div class="box">
      <p>⏱ Response time: <strong>48–72 hours</strong><br>
      The finished design will be sent to: <strong>${customerEmail}</strong></p>
    </div>
    <p style="font-size:13px;color:#999;">
      If you have any questions, reach out to us:<br>
      <a href="mailto:info@senkisem.hu" style="color:#000;font-weight:600;text-decoration:none;">info@senkisem.hu</a>
    </p>
    <p style="margin-top:32px;font-size:14px;color:#333;">
      Best regards,<br>
      <strong>The Senkisem Team</strong>
    </p>
  </div>
  <div class="ftr">
    <span>© ${new Date().getFullYear()} Senkisem | All rights reserved</span>
  </div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────
//  MAIN FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Send admin notification email
 * @param {object}   answers       – all modal answers
 * @param {File[]}   uploadedFiles – array of uploaded File objects
 * @param {boolean}  isCheckout    – true if user clicked "I want it"
 */
async function sendIdModalAdminEmail(answers, uploadedFiles, isCheckout) {
  const files = [];
  for (let i = 0; i < uploadedFiles.length; i++) {
    try {
      const converted = await fileToBase64(uploadedFiles[i]);
      files.push(converted); // { base64, name }
    } catch (e) {
      console.warn('⚠️ Image conversion error:', e.message);
    }
  }

  const adminHtml = buildAdminEmailHTML(answers, files.length, isCheckout);

  const product = answers.q13 || 'Not selected';
  const size    = answers.size || '—';
  const intent  = isCheckout ? 'WANTS TO ORDER' : 'LATER';
  const subject = `[ID: Senkisem] New submission — ${product} ${size} — ${intent}`;

  const res = await fetch(ID_MODAL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type:          'admin',
      subject,
      html:          adminHtml,
      uploadedFiles: files,
      isCheckout,
      answers,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[ID Modal] Admin email API error (${res.status}): ${errText}`);
  }

  console.log('[ID Modal] Admin email sent successfully.');
  return res.json();
}

/**
 * Send confirmation email to the user ("Later" case)
 * @param {string} customerEmail – email address entered by the user
 */
async function sendIdModalConfirmationEmail(customerEmail) {
  const confirmHtml = buildConfirmationEmailHTML(customerEmail);

  const res = await fetch(ID_MODAL_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type:          'confirmation',
      subject:       '✅ Received — We will be in touch | Senkisem',
      html:          confirmHtml,
      customerEmail,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[ID Modal] Confirmation email API error (${res.status}): ${errText}`);
  }

  console.log('[ID Modal] Confirmation email sent successfully:', customerEmail);
  return res.json();
}

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────
window.idModalService = {
  sendAdminEmail:        sendIdModalAdminEmail,
  sendConfirmationEmail: sendIdModalConfirmationEmail,
};