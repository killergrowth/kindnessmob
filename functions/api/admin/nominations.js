/**
 * GET  /api/admin/nominations  — list/filter nominations
 * POST /api/admin/nominations/manual — add manual nomination
 * POST /api/admin/nominations/bulk-archive — bulk archive
 * POST /api/admin/nominations/test — submit test nomination
 */

import { getAuthedUser, requireRole, jsonOk, jsonError, writeAuditLog } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const params = url.searchParams;

  // Filters
  const status        = params.get('status') || null;
  const search        = params.get('search') || null;
  const dateFrom      = params.get('date_from') || null;
  const dateTo        = params.get('date_to') || null;
  const flagCode      = params.get('flag') || null;
  const includeArch   = params.get('include_archived') === '1';
  const excludeComp   = params.get('exclude_completed') === '1';
  const fuzzy         = params.get('fuzzy') === '1';
  const includeTest   = params.get('include_test') === '1';
  const page          = Math.max(1, parseInt(params.get('page') || '1', 10));
  const limit         = Math.min(100, parseInt(params.get('limit') || '50', 10));
  const offset        = (page - 1) * limit;

  let where = ['1=1'];
  const binds = [];

  if (!includeTest) { where.push('n.is_test = 0'); }
  if (status) { where.push('n.status = ?'); binds.push(status); }
  if (!includeArch) { where.push("n.status NOT IN ('archived', 'expired')"); }
  if (excludeComp) { where.push("n.status != 'completed'"); }
  if (dateFrom) { where.push('n.submitted_at >= ?'); binds.push(dateFrom); }
  if (dateTo) { where.push('n.submitted_at <= ?'); binds.push(dateTo + 'T23:59:59'); }

  if (search) {
    if (fuzzy) {
      where.push('(n.nominee_handle LIKE ? OR n.submitter_name LIKE ? OR n.reason LIKE ?)');
      binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
    } else {
      where.push('(n.nominee_handle = ? OR n.submitter_name = ?)');
      binds.push(search, search);
    }
  }

  let sql = `
    SELECT n.*, GROUP_CONCAT(f.flag_code) as flags
    FROM nominations n
    LEFT JOIN nomination_flags f ON f.nomination_id = n.id
    ${flagCode ? 'INNER JOIN nomination_flags ff ON ff.nomination_id = n.id AND ff.flag_code = ?' : ''}
    WHERE ${where.join(' AND ')}
    GROUP BY n.id
    ORDER BY n.submitted_at DESC
    LIMIT ? OFFSET ?
  `;

  const allBinds = flagCode ? [flagCode, ...binds, limit, offset] : [...binds, limit, offset];
  const rows = await env.DB.prepare(sql).bind(...allBinds).all();

  // Strip PII for roles that shouldn't see it
  const canSeePII = requireRole(user, 'developer', 'super_mod');
  const nominations = (rows.results || []).map(n => {
    const out = { ...n, flags: n.flags ? n.flags.split(',') : [] };
    if (!canSeePII) {
      delete out.submitter_email;
      delete out.submitter_ip;
      delete out.submitter_ua;
    }
    return out;
  });

  // Total count for pagination
  const countSql = `
    SELECT COUNT(DISTINCT n.id) as total FROM nominations n
    ${flagCode ? 'INNER JOIN nomination_flags ff ON ff.nomination_id = n.id AND ff.flag_code = ?' : ''}
    WHERE ${where.join(' AND ')}
  `;
  const countBinds = flagCode ? [flagCode, ...binds] : binds;
  const total = await env.DB.prepare(countSql).bind(...countBinds).first();

  return jsonOk({ nominations, total: total?.total || 0, page, limit });
}

export async function onRequestPost({ request, env }) {
  const user = await getAuthedUser(request, env);
  if (!user) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith('/manual')) {
    return handleManual(request, env, user);
  }
  if (path.endsWith('/bulk-archive')) {
    return handleBulkArchive(request, env, user);
  }
  if (path.endsWith('/test')) {
    return handleTest(request, env, user);
  }

  return jsonError('Not found', 404);
}

async function handleManual(request, env, user) {
  if (!requireRole(user, 'developer', 'super_mod')) return jsonError('Forbidden', 403);

  const body = await request.json();
  const { nominee_handle, platform = 'tiktok', reason, nominated_by_handle, content_link, nominee_follower_count } = body;
  if (!nominee_handle || !reason) return jsonError('nominee_handle and reason are required.');

  const result = await env.DB.prepare(`
    INSERT INTO nominations (platform, nominee_handle, nominee_follower_count, nominated_by_handle, reason, content_link, is_manual, submitter_ip, submitter_ua)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'manual', 'manual')
  `).bind(platform, nominee_handle, nominee_follower_count || null, nominated_by_handle || null, reason, content_link || null).run();

  await writeAuditLog(env, user.email, 'manual_add', result.meta.last_row_id, { nominee_handle });
  return jsonOk({ ok: true, id: result.meta.last_row_id });
}

async function handleBulkArchive(request, env, user) {
  if (!requireRole(user, 'developer', 'super_mod')) return jsonError('Forbidden', 403);

  const body = await request.json();
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) return jsonError('ids array required.');

  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(
    `UPDATE nominations SET status = 'archived', updated_at = datetime('now') WHERE id IN (${placeholders}) AND status NOT IN ('completed','deleted')`
  ).bind(...ids).run();

  await writeAuditLog(env, user.email, 'bulk_archive', null, { ids });
  return jsonOk({ ok: true, archived: ids.length });
}

async function handleTest(request, env, user) {
  if (!requireRole(user, 'developer')) return jsonError('Forbidden', 403);

  const body = await request.json().catch(() => ({}));
  const result = await env.DB.prepare(`
    INSERT INTO nominations (platform, nominee_handle, reason, is_test, submitter_ip, submitter_ua)
    VALUES ('tiktok', '@test_nomination', 'This is a test submission.', 1, 'test', 'test')
  `).run();

  await writeAuditLog(env, user.email, 'test_submit', result.meta.last_row_id, null);
  return jsonOk({ ok: true, id: result.meta.last_row_id });
}
