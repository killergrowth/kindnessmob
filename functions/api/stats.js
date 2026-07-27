/**
 * GET /api/stats
 * Public stats endpoint. Returns cached values, refreshed every 60s.
 */

import { JSON_HEADERS } from './_auth.js';

const CACHE_TTL_MS = 60 * 1000;

export async function onRequestGet({ env }) {
  try {
    // Try cache first
    const cached = await env.DB.prepare(
      "SELECT key, value, updated_at FROM stats_cache WHERE key IN ('successful_mobs','total_comments','avg_comments_per_mob','todays_mob_handle')"
    ).all();

    const now = Date.now();
    const cacheMap = {};
    let stale = false;

    for (const row of cached.results || []) {
      cacheMap[row.key] = row;
      const age = now - new Date(row.updated_at).getTime();
      if (age > CACHE_TTL_MS) stale = true;
    }

    if (stale || Object.keys(cacheMap).length < 4) {
      await refreshStats(env);
      return getStats(env);
    }

    return new Response(JSON.stringify({
      ok: true,
      successful_mobs: parseInt(cacheMap['successful_mobs']?.value || '0', 10),
      total_comments: parseInt(cacheMap['total_comments']?.value || '0', 10),
      avg_comments_per_mob: parseFloat(cacheMap['avg_comments_per_mob']?.value || '0'),
      todays_mob_handle: cacheMap['todays_mob_handle']?.value || null,
    }), { headers: JSON_HEADERS });

  } catch (err) {
    console.error('stats error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Stats unavailable' }), { status: 500, headers: JSON_HEADERS });
  }
}

async function getStats(env) {
  const rows = await env.DB.prepare(
    "SELECT key, value FROM stats_cache WHERE key IN ('successful_mobs','total_comments','avg_comments_per_mob','todays_mob_handle')"
  ).all();
  const m = {};
  for (const r of rows.results || []) m[r.key] = r.value;
  return new Response(JSON.stringify({
    ok: true,
    successful_mobs: parseInt(m['successful_mobs'] || '0', 10),
    total_comments: parseInt(m['total_comments'] || '0', 10),
    avg_comments_per_mob: parseFloat(m['avg_comments_per_mob'] || '0'),
    todays_mob_handle: m['todays_mob_handle'] || null,
  }), { headers: JSON_HEADERS });
}

async function refreshStats(env) {
  // Count completed nominations (successful mobs)
  const mobCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM nominations WHERE status = 'completed' AND is_test = 0"
  ).first();

  // Seed with real data when available; for now write zeroes as placeholder
  const upsert = env.DB.prepare(
    "INSERT INTO stats_cache (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  );

  const now = new Date().toISOString();
  await env.DB.batch([
    upsert.bind('successful_mobs', String(mobCount?.cnt || 0)),
    upsert.bind('total_comments', '0'),
    upsert.bind('avg_comments_per_mob', '0'),
    upsert.bind('todays_mob_handle', ''),
  ]);
}
