/**
 * POST /api/nominate
 * Public nomination submission endpoint.
 * Turnstile verification, validation, rate limiting, R2 upload handling.
 */

import { JSON_HEADERS, jsonOk, jsonError } from './_auth.js';

const MAX_REASON_LEN = 512;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const DUPE_WINDOW_DAYS = 30;

export async function onRequestPost({ request, env }) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  try {
    const form = await request.formData();

    // Honeypot check
    if (form.get('website')) {
      return jsonOk({ ok: true }); // silently accept bots
    }

    // Turnstile verification
    const turnstileToken = form.get('cf-turnstile-response') || '';
    const turnstileSecret = env.TURNSTILE_SECRET || '1x0000000000000000000000000000000AA';
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`,
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return jsonError('Bot check failed. Please try again.', 400);
    }

    // Extract fields
    const submitterName   = (form.get('submitter_name') || '').trim();
    const submitterEmail  = (form.get('submitter_email') || '').trim().toLowerCase();
    const nominatedBy     = (form.get('nominated_by_handle') || '').trim();
    const nomineeHandle   = (form.get('nominee_handle') || '').trim();
    const platform        = (form.get('platform') || 'tiktok').trim().toLowerCase();
    const reason          = (form.get('reason') || '').trim();
    const contentLink     = (form.get('content_link') || '').trim();
    const followerCount   = parseInt(form.get('nominee_follower_count') || '0', 10) || null;

    // Validation
    if (!nomineeHandle) return jsonError('Nominee handle is required.');
    if (!reason) return jsonError('Reason is required.');
    if (reason.length > MAX_REASON_LEN) return jsonError(`Reason must be ${MAX_REASON_LEN} characters or less.`);
    if (contentLink && !/^https?:\/\/.+/.test(contentLink)) return jsonError('Content link must be a valid URL.');

    // IP rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const recentCount = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM nominations WHERE submitter_ip = ? AND submitted_at > ? AND is_test = 0'
    ).bind(ip, windowStart).first();
    if (recentCount && recentCount.cnt >= RATE_LIMIT_MAX) {
      return jsonError('Too many nominations from your IP. Please try again later.', 429);
    }

    // Duplicate check
    const dupeWindow = new Date(Date.now() - DUPE_WINDOW_DAYS * 86400000).toISOString();
    const dupe = await env.DB.prepare(
      'SELECT id FROM nominations WHERE nominee_handle = ? AND platform = ? AND submitted_at > ? AND status != ? AND is_test = 0'
    ).bind(nomineeHandle, platform, dupeWindow, 'deleted').first();
    if (dupe) {
      return jsonOk({ ok: true, duplicate: true, message: 'This creator has already been nominated recently. We\'ll keep it in mind!' });
    }

    // Handle screenshot upload (if provided)
    let screenshotKey = null;
    const screenshotFile = form.get('screenshot');
    if (screenshotFile && screenshotFile.size > 0) {
      if (screenshotFile.size > 5 * 1024 * 1024) {
        return jsonError('Screenshot must be under 5MB.');
      }
      if (!screenshotFile.type.startsWith('image/')) {
        return jsonError('Screenshot must be an image file.');
      }
      screenshotKey = `nominations/${Date.now()}-${nomineeHandle.replace(/[^a-z0-9]/gi, '_')}.${screenshotFile.type.split('/')[1] || 'jpg'}`;
      if (env.SCREENSHOTS) {
        await env.SCREENSHOTS.put(screenshotKey, screenshotFile.stream(), {
          httpMetadata: { contentType: screenshotFile.type }
        });
      }
    }

    // Insert nomination
    const ua = request.headers.get('User-Agent') || '';
    const result = await env.DB.prepare(`
      INSERT INTO nominations
        (platform, nominee_handle, nominee_follower_count, nominated_by_handle,
         submitter_name, submitter_email, reason, content_link, screenshot_key,
         submitter_ip, submitter_ua)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      platform, nomineeHandle, followerCount, nominatedBy || null,
      submitterName || null, submitterEmail || null, reason,
      contentLink || null, screenshotKey,
      ip, ua
    ).run();

    return jsonOk({ ok: true, id: result.meta.last_row_id });

  } catch (err) {
    console.error('nominate error:', err);
    return jsonError('Something went wrong. Please try again.', 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
