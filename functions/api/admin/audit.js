/**
 * GET /api/admin/audit
 * Audit log — developer only.
 */

import { getAuthedUser, requireRole, jsonOk, jsonError } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);
  if (!requireRole(user, 'developer')) return jsonError('Forbidden', 403);

  const url = new URL(request.url);
  const nominationId = url.searchParams.get('nomination_id');
  const limit  = Math.min(200, parseInt(url.searchParams.get('limit') || '100', 10));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  let sql = 'SELECT * FROM audit_log';
  const binds = [];
  if (nominationId) {
    sql += ' WHERE nomination_id = ?';
    binds.push(nominationId);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return jsonOk({ log: rows.results || [], limit, offset });
}
