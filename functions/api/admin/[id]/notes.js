/**
 * POST /api/admin/nominations/:id/notes
 * Add a note to a nomination.
 */

import { getAuthedUser, jsonOk, jsonError, writeAuditLog } from '../../_auth.js';

export async function onRequestPost({ request, env, params }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return jsonError('Invalid id', 400);

  const body = await request.json();
  const { body_html, visible_to_guest_hosts = false } = body;

  if (!body_html || !body_html.trim()) return jsonError('Note body is required.');

  // guest_host can only add notes; visible_to_guest_hosts must be false for modsters
  const visibleToGuests = user.role === 'developer' || user.role === 'super_mod' ? (visible_to_guest_hosts ? 1 : 0) : 0;

  await env.DB.prepare(
    'INSERT INTO nomination_notes (nomination_id, author_email, body_html, visible_to_guest_hosts) VALUES (?, ?, ?, ?)'
  ).bind(id, user.email, body_html, visibleToGuests).run();

  await writeAuditLog(env, user.email, 'note_add', id, { visible_to_guest_hosts: visibleToGuests });

  return jsonOk({ ok: true });
}

export async function onRequestGet({ request, env, params }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return jsonError('Invalid id', 400);

  let sql = 'SELECT * FROM nomination_notes WHERE nomination_id = ?';
  const binds = [id];

  if (user.role === 'guest_host') {
    sql += ' AND visible_to_guest_hosts = 1';
  }
  sql += ' ORDER BY created_at ASC';

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return jsonOk({ notes: rows.results || [] });
}
