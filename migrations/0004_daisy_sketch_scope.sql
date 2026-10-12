-- Migration 0004: Scope daisy_sketches by (project_id, id) composite primary key
-- Enables distinct projects to have sketches with the same sketchId without collision.
--
-- Applied by scripts/apply-daisy-migration.mjs as ONE D1 /query request
-- ({ sql: "s1;\ns2;..." }, run by D1 as one batch/transaction; single HTTP
-- request, executed atomically by D1). Foreign keys stay ON throughout: the
-- statements are ordered so every FK is valid at every step, so no PRAGMA is
-- needed (D1 ignores/does not carry PRAGMA foreign_keys between requests).
--
-- FK correctness: daisy_comments_new references daisy_sketches_new directly.
-- When daisy_sketches_new is renamed to daisy_sketches, SQLite (>= 3.26 with
-- legacy_alter_table=OFF, the default and D1's behaviour) rewrites the FK
-- clause in daisy_comments_new to REFERENCES "daisy_sketches"(project_id, id).
--
-- Rerun-safe: leftover *_new tables from a partial failure are dropped first.

DROP TABLE IF EXISTS daisy_comments_new;
DROP TABLE IF EXISTS daisy_sketches_new;

CREATE TABLE daisy_sketches_new (
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

INSERT INTO daisy_sketches_new (
  id, project_id, group_id, section, label, kind, image_url, url, status, created_at
)
SELECT id, project_id, group_id, section, label, kind, image_url, url, status, created_at
FROM daisy_sketches;

CREATE TABLE daisy_comments_new (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
  sketch_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'owner',
  body TEXT NOT NULL,
  x REAL,
  y REAL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id, sketch_id) REFERENCES daisy_sketches_new(project_id, id) ON DELETE CASCADE
);

-- Old comments have no author column; author defaults to 'owner'.
INSERT INTO daisy_comments_new (
  id, project_id, sketch_id, author, body, x, y, created_at
)
SELECT id, project_id, sketch_id, 'owner', body, x, y, created_at
FROM daisy_comments;

-- Child first, then parent (old daisy_sketches has no children left).
DROP TABLE daisy_comments;
DROP TABLE daisy_sketches;

ALTER TABLE daisy_sketches_new RENAME TO daisy_sketches;
ALTER TABLE daisy_comments_new RENAME TO daisy_comments;

CREATE INDEX IF NOT EXISTS idx_daisy_sketches_project ON daisy_sketches(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_sketches_group ON daisy_sketches(group_id);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_sketch ON daisy_comments(project_id, sketch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daisy_comments_project ON daisy_comments(project_id);
