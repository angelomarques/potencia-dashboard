-- Daisy design studio schema (external AI UI-designer agent)

CREATE TABLE IF NOT EXISTS daisy_projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  preview_url TEXT,
  current_section TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daisy_messages (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daisy_sketches (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  group_id TEXT,
  section TEXT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'card',
  image_url TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daisy_comments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  sketch_id TEXT NOT NULL REFERENCES daisy_sketches(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  x REAL,
  y REAL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daisy_gates (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  references_json TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS daisy_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  direction TEXT NOT NULL,
  type TEXT NOT NULL,
  project_id TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_daisy_projects_status ON daisy_projects(status);
CREATE INDEX IF NOT EXISTS idx_daisy_projects_last_activity ON daisy_projects(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_daisy_messages_project ON daisy_messages(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_sketches_project ON daisy_sketches(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_sketches_group ON daisy_sketches(group_id);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_sketch ON daisy_comments(sketch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_project ON daisy_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_daisy_gates_project ON daisy_gates(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_gates_project_status ON daisy_gates(project_id, status);
CREATE INDEX IF NOT EXISTS idx_daisy_events_outbound_seq ON daisy_events(direction, status, seq);
CREATE INDEX IF NOT EXISTS idx_daisy_events_due ON daisy_events(direction, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_daisy_events_project ON daisy_events(project_id);
