/**
 * Cloudflare Pages Function — /submit
 * Handles both nomination and contact form submissions.
 * Sends branded HTML email via Gmail API (service account JWT auth).
 * Returns JSON { ok: true } or { ok: false, error: string }
 */

function objToB64url(obj) {
  const json = JSON.stringify(obj);
  let binary = '';
  for (let i = 0; i < json.length; i++) binary += String.fromCharCode(json.charCodeAt(i) & 0xff);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufToB64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGmailAccessToken(serviceEmail, privateKeyPem, impersonateEmail) {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = objToB64url({ alg: 'RS256', typ: 'JWT' });
  const claimB64  = objToB64url({
    iss: serviceEmail, sub: impersonateEmail,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  });
  const signingInput = `${headerB64}.${claimB64}`;

  const normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
  const b64 = normalizedKey.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const decoded = atob(b64);
  const keyBuffer = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) keyBuffer[i] = decoded.charCodeAt(i);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${bufToB64url(sigBytes)}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  const data = await tokenRes.json();
  if (!data.access_token) throw new Error('Token error ' + tokenRes.status + ': ' + JSON.stringify(data));
  return data.access_token;
}

function buildNominationEmail(fields) {
  const { name, email, platform, nominee, reason, postLink } = fields;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#C8281A;padding:32px 40px;text-align:center;">
          <div style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">&#10084;&#65039; The Kindness Mob</div>
          <div style="color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">New Nomination</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:36px 40px;">
          <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6;">
            A new creator has been nominated for a kindness mob. Here are the details:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:10px 14px;background:#fafafa;border-left:3px solid #C8281A;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;width:130px;font-weight:600;">Submitted By</td>
              <td style="padding:10px 14px;background:#fafafa;font-size:15px;color:#111;font-weight:600;">${name || '(anonymous)'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Their Email</td>
              <td style="padding:10px 14px;font-size:15px;color:#111;">${email ? `<a href="mailto:${email}" style="color:#C8281A;">${email}</a>` : 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fafafa;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Platform</td>
              <td style="padding:10px 14px;background:#fafafa;font-size:15px;color:#111;text-transform:capitalize;">${platform || 'Not specified'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Nominee</td>
              <td style="padding:10px 14px;font-size:15px;color:#111;font-weight:700;">${nominee || '(not provided)'}</td>
            </tr>
            ${postLink ? `<tr>
              <td style="padding:10px 14px;background:#fafafa;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Post Link</td>
              <td style="padding:10px 14px;background:#fafafa;font-size:15px;"><a href="${postLink}" style="color:#C8281A;">${postLink}</a></td>
            </tr>` : ''}
          </table>
          ${reason ? `
          <div style="margin-top:24px;">
            <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Why They Deserve It</div>
            <div style="background:#fafafa;border-left:3px solid #C8281A;padding:16px;font-size:15px;color:#333;line-height:1.7;">${reason.replace(/\n/g, '<br>')}</div>
          </div>` : ''}
        </td></tr>
        <tr><td style="background:#111;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;">The Kindness Mob &bull; kindnessmob.pages.dev</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildContactEmail(fields) {
  const { name, email, subject, message } = fields;
  const subjectLabel = (subject || 'general').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#C8281A;padding:32px 40px;text-align:center;">
          <div style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">&#10084;&#65039; The Kindness Mob</div>
          <div style="color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">New Message — ${subjectLabel}</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:36px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
            <tr>
              <td style="padding:10px 14px;background:#fafafa;border-left:3px solid #C8281A;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;width:130px;font-weight:600;">From</td>
              <td style="padding:10px 14px;background:#fafafa;font-size:15px;color:#111;font-weight:600;">${name || '(anonymous)'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Email</td>
              <td style="padding:10px 14px;font-size:15px;color:#111;">${email ? `<a href="mailto:${email}" style="color:#C8281A;">${email}</a>` : 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fafafa;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Subject</td>
              <td style="padding:10px 14px;background:#fafafa;font-size:15px;color:#111;">${subjectLabel}</td>
            </tr>
          </table>
          ${message ? `
          <div>
            <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:600;">Message</div>
            <div style="background:#fafafa;border-left:3px solid #C8281A;padding:16px;font-size:15px;color:#333;line-height:1.7;">${message.replace(/\n/g, '<br>')}</div>
          </div>` : ''}
        </td></tr>
        <tr><td style="background:#111;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;">The Kindness Mob &bull; kindnessmob.pages.dev</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();
    const formType = form.get('form_type') || 'contact';

    // --- Cloudflare Turnstile verification ---
    const turnstileToken  = form.get('cf-turnstile-response') || '';
    const turnstileSecret = env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA';
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`,
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return new Response(JSON.stringify({ ok: false, error: 'Bot check failed. Please try again.' }), {
        status: 400, headers: JSON_HEADERS,
      });
    }

    // Build email content based on form type
    let subject, htmlBody;
    if (formType === 'nomination') {
      subject = 'New Nomination - The Kindness Mob';
      htmlBody = buildNominationEmail({
        name:     form.get('your_name')  || '',
        email:    form.get('your_email') || '',
        platform: form.get('platform')   || '',
        nominee:  form.get('nominee')    || '',
        reason:   form.get('reason')     || '',
        postLink: form.get('post_link')  || '',
      });
    } else {
      subject = 'New Contact Message - The Kindness Mob';
      htmlBody = buildContactEmail({
        name:    form.get('name')    || '',
        email:   form.get('email')   || '',
        subject: form.get('subject') || 'general',
        message: form.get('message') || '',
      });
    }

    // Get Gmail access token
    const accessToken = await getGmailAccessToken(
      env.GMAIL_SERVICE_EMAIL,
      env.GMAIL_PRIVATE_KEY,
      env.GMAIL_FROM
    );

    // Build MIME message
    const fromName = form.get('name') || form.get('your_name') || '';
    const fromEmail = form.get('email') || form.get('your_email') || '';
    const replyTo = fromEmail ? `${fromName} <${fromEmail}>` : '';

    const mimeLines = [
      `From: The Kindness Mob <${env.GMAIL_FROM}>`,
      `To: ${env.GMAIL_TO}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      '',
      htmlBody,
    ].filter(l => l !== null).join('\r\n');

    const emailBytes = new TextEncoder().encode(mimeLines);
    let emailBinary = '';
    for (let i = 0; i < emailBytes.length; i++) emailBinary += String.fromCharCode(emailBytes[i]);
    const encoded = btoa(emailBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sendRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(env.GMAIL_FROM)}/messages/send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      }
    );

    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error('Gmail send ' + sendRes.status + ': ' + err.slice(0, 200));
    }

    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });

  } catch (err) {
    console.error('submit error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message.slice(0, 200) }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}
