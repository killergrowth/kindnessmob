/**
 * Cloudflare Pages Function -- /join
 * Handles "Join the Mob" signups.
 * Validates input, dedupes by email, writes to Supabase kg_km_members.
 * Returns JSON { ok: true } or { ok: false, error: string }
 *
 * Mini forms (about-page, homepage) skip Turnstile -- no widget is rendered there.
 * The full /join page renders a Turnstile widget and is fully verified.
 */

const SUPABASE_URL = 'https://uejdsmaejdoupecgtzuj.supabase.co';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const MINI_FORM_SOURCES = ['about-page', 'homepage', 'mini-form', 'homepage-mini'];

export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();
    const firstName = (form.get('first_name') || '').trim();
    const lastName  = (form.get('last_name')  || '').trim();
    const email     = (form.get('email')       || '').trim().toLowerCase();
    const source    = (form.get('source')      || 'website').trim();

    // --- Validation ---
    if (!firstName) return json400('First name is required.');
    if (!lastName)  return json400('Last name is required.');
    if (!email || !email.includes('@')) return json400('A valid email is required.');

    // --- Cloudflare Turnstile (skip for mini forms -- no widget rendered) ---
    if (!MINI_FORM_SOURCES.includes(source)) {
      const turnstileToken  = form.get('cf-turnstile-response') || '';
      const turnstileSecret = env.TURNSTILE_SECRET;
      if (!turnstileSecret) {
        console.error('TURNSTILE_SECRET env var not set');
        return new Response(JSON.stringify({ ok: false, error: 'Server configuration error.' }), { status: 500, headers: JSON_HEADERS });
      }
      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return new Response(JSON.stringify({ ok: false, error: 'Bot check failed. Please try again.' }), { status: 400, headers: JSON_HEADERS });
      }
    }

    // --- Write to Supabase (upsert on email) ---
    const svcKey = env.SUPABASE_SERVICE_KEY;
    if (!svcKey) {
      console.error('SUPABASE_SERVICE_KEY env var not set');
      return new Response(JSON.stringify({ ok: false, error: 'Server configuration error.' }), { status: 500, headers: JSON_HEADERS });
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/kg_km_members`, {
      method: 'POST',
      headers: {
        'apikey': svcKey,
        'Authorization': 'Bearer ' + svcKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, source }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      // Duplicate email = already a member -- treat as success
      if (insertRes.status === 409 || err.includes('unique')) {
        return new Response(JSON.stringify({ ok: true, already_member: true }), { headers: JSON_HEADERS });
      }
      throw new Error('DB error ' + insertRes.status + ': ' + err.slice(0, 200));
    }

    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });

  } catch (err) {
    console.error('join error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: 'Something went wrong. Please try again.' }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}

function json400(error) {
  return new Response(JSON.stringify({ ok: false, error }), { status: 400, headers: JSON_HEADERS });
}
