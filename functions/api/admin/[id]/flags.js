/**
 * POST /api/admin/nominations/:id/flags
 * Set or clear a flag on a nomination.
 * Body: { flag_code: string, action: 'set' | 'clear' }
 */

import { getAuthedUser, requireRole, jsonOk, jsonError, writeAuditLog } from '../../_auth.js';

export async function onRequestPost({ request, env, params }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);
  if (!requireRole(user, 'developer', 'super_mod', 'modster')) return jsonError('Forbidden', 403);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return jsonError('Invalid id', 400);

  const body = await request.json();
  const { flag_code, action } = body;

  if (!flag_code) return jsonError('flag_code is required.');
  if (!['set', 'clear'].includes(action)) return jsonError('action must be "set" or "clear".');

  if (action === 'set') {
    await env.DB.prepare(
      'INSERT INTO nomination_flags (nomination_id, flag_code, set_by) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
    ).bind(id, flag_code, user.email).run();
    await writeAuditLog(env, user.email, 'flag_set', id, { flag_code });
  } else {
    await env.DB.prepare(
      'DELETE FROM nomination_flags WHERE nomination_id = ? AND flag_code = ?'
    ).bind(id, flag_code).run();
    await writeAuditLog(env, user.email, 'flag_clear', id, { flag_code });
  }

  return jsonOk({ ok: true, flag_code, action });
}

export async function onRequestGet({ request, env, params }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  const rows = await env.DB.prepare('SELECT * FROM nomination_flags WHERE nomination_id = ? ORDER BY set_at').bind(id).all();
  return jsonOk({ flags: rows.results || [] });
}
