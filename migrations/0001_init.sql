-- Multi-app ready schema for Potencia Dashboard
-- Apps / workspaces
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- better-auth tables
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

-- Kanban
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY NOT NULL,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  assignee_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  due_date INTEGER,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_session_user ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_account_user ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_boards_app ON boards(app_id);
CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id);
CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id);
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id);

-- Seed Lawa app + board + default columns
INSERT OR IGNORE INTO apps (id, slug, name, description, created_at)
VALUES ('app_lawa', 'lawa', 'Lawa', 'Lawa product workspace', unixepoch() * 1000);

INSERT OR IGNORE INTO boards (id, app_id, name, description, created_at, updated_at)
VALUES ('board_lawa', 'app_lawa', 'Lawa Board', 'Default Lawa kanban board', unixepoch() * 1000, unixepoch() * 1000);

INSERT OR IGNORE INTO columns (id, board_id, name, position, color, created_at) VALUES
  ('col_lawa_backlog', 'board_lawa', 'Backlog', 0, '#94a3b8', unixepoch() * 1000),
  ('col_lawa_todo', 'board_lawa', 'To do', 1, '#6366f1', unixepoch() * 1000),
  ('col_lawa_progress', 'board_lawa', 'In Progress', 2, '#3b82f6', unixepoch() * 1000),
  ('col_lawa_review', 'board_lawa', 'Review', 3, '#f59e0b', unixepoch() * 1000),
  ('col_lawa_done', 'board_lawa', 'Done', 4, '#22c55e', unixepoch() * 1000);

INSERT OR IGNORE INTO cards (id, column_id, board_id, title, description, position, priority, created_at, updated_at) VALUES
  ('card_welcome', 'col_lawa_backlog', 'board_lawa', 'Welcome to Potencia Dashboard', 'Drag cards between columns, create new ones, and track Lawa work here.', 0, 'medium', unixepoch() * 1000, unixepoch() * 1000),
  ('card_auth', 'col_lawa_done', 'board_lawa', 'Auth + Turnstile live', 'Sign-up is protected by Cloudflare Turnstile.', 0, 'low', unixepoch() * 1000, unixepoch() * 1000);
