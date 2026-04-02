-- Kiaros Database Schema

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_encrypted TEXT NOT NULL,
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
  required_scopes TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  reversible INTEGER NOT NULL DEFAULT 0,
  sandboxed INTEGER NOT NULL DEFAULT 1,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  enabled INTEGER NOT NULL DEFAULT 1,
  mcp_config TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approved_scopes (
  tool_id TEXT NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,
  confirm_each_use INTEGER DEFAULT 0,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tool_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool_id TEXT,
  tool_name TEXT,
  input TEXT,
  output TEXT,
  approved_by TEXT,
  duration_ms INTEGER,
  token_cost INTEGER,
  reversible INTEGER DEFAULT 0,
  reversed INTEGER DEFAULT 0,
  undo_data TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

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
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

-- Kairos-inspired: Task continuation system
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'paused')),
  steps TEXT,           -- JSON array of step objects
  current_step INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Kairos-inspired: Tick log for evaluation loop
CREATE TABLE IF NOT EXISTS tick_log (
  id TEXT PRIMARY KEY,
  tick_number INTEGER NOT NULL,
  context_summary TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('act', 'skip', 'defer')),
  action_taken TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tick_created ON tick_log(created_at DESC);
