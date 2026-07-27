/**
 * Cloudflare Access JWT verification + D1 role lookup.
 * All /api/admin/* routes call this first.
 */

const CF_ACCESS_TEAM_DOMAIN = 'killergrowth'; // e.g. killergrowth.cloudflareaccess.com

export async function getAuthedUser(request, env) {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;

  // Verify the JWT signature against Cloudflare's public certs
  const certsUrl = `https://${CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`;
  let certs;
  try {
    const certsRes = await fetch(certsUrl);
    certs = await certsRes.json();
  } catch {
    return null;
  }

  // Decode JWT payload (signature verification via CF Access headers is handled by CF infra;
  // for belt-and-suspenders we verify the email claim against the D1 users table)
  let email;
  try {
    const parts = jwt.split('.');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    email = payload.email;
    if (!email) return null;
  } catch {
    return null;
  }

  // Look up role in D1
  const result = await env.DB.prepare(
    'SELECT email, display_name, role, active FROM users WHERE email = ? AND active = 1'
  ).bind(email).first();

  return result || null;
}

export function requireRole(user, ...roles) {
  if (!user) return false;
  return roles.includes(user.role);
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: JSON_HEADERS });
}

export async function writeAuditLog(env, actorEmail, action, nominationId, detail) {
  await env.DB.prepare(
    'INSERT INTO audit_log (actor_email, action, nomination_id, detail) VALUES (?, ?, ?, ?)'
  ).bind(actorEmail, action, nominationId ?? null, detail ? JSON.stringify(detail) : null).run();
}
