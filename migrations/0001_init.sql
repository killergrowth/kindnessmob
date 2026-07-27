-- Migration 0001: initial schema for The Kindness Mob nomination system
-- Apply via: npx wrangler d1 migrations apply <db-name> --remote (staging first, always)

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('developer','super_mod','modster','guest_host')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nominations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  nominee_handle TEXT NOT NULL,
  nominee_follower_count INTEGER,
  nominated_by_handle TEXT,
  submitter_name TEXT,
  submitter_email TEXT,
  reason TEXT NOT NULL CHECK (length(reason) <= 512),
  content_link TEXT,
  screenshot_key TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','further_review','round2_approved','completed','archived','expired','deleted')),
  is_test INTEGER NOT NULL DEFAULT 0,
  is_manual INTEGER NOT NULL DEFAULT 0,
  submitter_ip TEXT,
  submitter_ua TEXT,
  pii_purged_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  legacy_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_nominations_status ON nominations(status);
CREATE INDEX IF NOT EXISTS idx_nominations_submitted ON nominations(submitted_at);
CREATE INDEX IF NOT EXISTS idx_nominations_nominee ON nominations(nominee_handle);

CREATE TABLE IF NOT EXISTS nomination_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomination_id INTEGER NOT NULL REFERENCES nominations(id),
  flag_code TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (nomination_id, flag_code)
);

CREATE TABLE IF NOT EXISTS nomination_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomination_id INTEGER NOT NULL REFERENCES nominations(id),
  author_email TEXT NOT NULL,
  body_html TEXT NOT NULL,
  visible_to_guest_hosts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  nomination_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_nomination ON audit_log(nomination_id);

CREATE TABLE IF NOT EXISTS stats_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
