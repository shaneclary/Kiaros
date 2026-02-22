-- Kiaros 2.0 Database Schema
-- Run once on first start via migrations in client.js

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_encrypted TEXT NOT NULL,   -- AES-256-GCM encrypted blob
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
  current_spend_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  required_scopes TEXT NOT NULL,   -- JSON array
  risk_level TEXT NOT NULL,        -- derived from scopes
  reversible INTEGER NOT NULL DEFAULT 0,
  sandboxed INTEGER NOT NULL DEFAULT 1,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  enabled INTEGER NOT NULL DEFAULT 1,
  mcp_config TEXT,                 -- JSON: {command, args, env}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approved_scopes (
  tool_id TEXT NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,            -- JSON array of approved scopes
  confirm_each_use INTEGER DEFAULT 0,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tool_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool_id TEXT,
  tool_name TEXT,
  input TEXT,                      -- JSON
  output TEXT,                     -- JSON
  approved_by TEXT,                -- 'auto' | 'user' | 'system'
  duration_ms INTEGER,
  token_cost INTEGER,              -- Cost in millicents
  reversible INTEGER DEFAULT 0,
  reversed INTEGER DEFAULT 0,
  undo_data TEXT,                  -- JSON: data needed to reverse action
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_log_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS working_memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'user_stated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  prompt              TEXT NOT NULL,            -- the task prompt sent to Claude
  schedule            TEXT NOT NULL,            -- cron expression or @shorthand
  credential_id       TEXT,                     -- null = use active credential
  model               TEXT,                     -- null = credential default
  enabled             INTEGER NOT NULL DEFAULT 1,
  last_run_at         TEXT,
  next_run_at         TEXT,
  last_result_summary TEXT,                     -- short summary of last result
  webhook_token       TEXT,                     -- 64-char hex secret for HTTP triggers
  last_error          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS scheduled_jobs_next ON scheduled_jobs(next_run_at, enabled);
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_webhook ON scheduled_jobs(webhook_token)
  WHERE webhook_token IS NOT NULL;

-- Document index: tracks files ingested from docsDir into the semantic archive
CREATE TABLE IF NOT EXISTS document_index (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL UNIQUE,   -- absolute path
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  chunk_count INTEGER DEFAULT 0,
  mtime       TEXT,                   -- ISO8601 mtime at last index
  indexed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  error       TEXT                    -- parse error from last attempt, if any
);
CREATE INDEX IF NOT EXISTS idx_document_index_path ON document_index(file_path);
