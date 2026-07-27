/**
 * POST /api/admin/nominations/:id/status
 * Update nomination status. Writes audit log.
 */

import { getAuthedUser, requireRole, jsonOk, jsonError, writeAuditLog } from '../../_auth.js';

const VALID_STATUSES = ['new', 'further_review', 'round2_approved', 'completed', 'archived', 'expired', 'deleted'];

// Role permissions per status transition
const CAN_TRANSITION = {
  developer:  VALID_STATUSES,
  super_mod:  ['new', 'further_review', 'round2_approved', 'completed', 'archived', 'deleted'],
  modster:    ['new', 'further_review', 'archived'],
  guest_host: [],
};

export async function onRequestPost({ request, env, params }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return jsonError('Invalid id', 400);

  const body = await request.json();
  const { status } = body;

  if (!VALID_STATUSES.includes(status)) return jsonError('Invalid status.');

  const allowed = CAN_TRANSITION[user.role] || [];
  if (!allowed.includes(status)) return jsonError('Forbidden', 403);

  const existing = await env.DB.prepare('SELECT status FROM nominations WHERE id = ?').bind(id).first();
  if (!existing) return jsonError('Nomination not found', 404);

  await env.DB.prepare(
    "UPDATE nominations SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, id).run();

  await writeAuditLog(env, user.email, 'status_change', id, { from: existing.status, to: status });

  return jsonOk({ ok: true, id, status });
}
