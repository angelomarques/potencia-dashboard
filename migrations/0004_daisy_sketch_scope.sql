-- Migration 0004: Scope daisy_sketches by (project_id, id) composite primary key
-- Enables distinct projects to have sketches with the same sketchId without collision.
-- Safe on existing data: copies existing sketches and comments, updates foreign keys, recreates indexes.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS daisy_comments_new;
DROP TABLE IF EXISTS daisy_sketches_new;

CREATE TABLE IF NOT EXISTS daisy_sketches_new (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  group_id TEXT,
  section TEXT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'card',
  image_url TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
);

INSERT OR IGNORE INTO daisy_sketches_new (
  id, project_id, group_id, section, label, kind, image_url, url, status, created_at
)
SELECT id, project_id, group_id, section, label, kind, image_url, url, status, created_at
FROM daisy_sketches;

CREATE TABLE IF NOT EXISTS daisy_comments_new (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  sketch_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'owner',
  body TEXT NOT NULL,
  x REAL,
  y REAL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id, sketch_id) REFERENCES daisy_sketches(project_id, id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO daisy_comments_new (
  id, project_id, sketch_id, body, x, y, created_at
)
SELECT id, project_id, sketch_id, body, x, y, created_at
FROM daisy_comments;

DROP TABLE IF EXISTS daisy_comments;
DROP TABLE IF EXISTS daisy_sketches;

ALTER TABLE daisy_sketches_new RENAME TO daisy_sketches;
ALTER TABLE daisy_comments_new RENAME TO daisy_comments;

CREATE INDEX IF NOT EXISTS idx_daisy_sketches_project ON daisy_sketches(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_sketches_group ON daisy_sketches(group_id);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_sketch ON daisy_comments(project_id, sketch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_project ON daisy_comments(project_id);

PRAGMA foreign_keys = ON;
