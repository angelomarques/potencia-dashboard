-- Multi-channel YouTube manager (R2 media + pending publish queue)
CREATE TABLE IF NOT EXISTS youtube_channels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  youtube_channel_id TEXT,
  -- OAuth tokens stored encrypted (AES-GCM base64); never plaintext in logs
  refresh_token_enc TEXT,
  access_token_enc TEXT,
  access_token_expires_at INTEGER,
  oauth_scopes TEXT,
  token_status TEXT NOT NULL DEFAULT 'missing', -- missing | ready | expired | error
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS youtube_videos (
  id TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES youtube_channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tags_json TEXT, -- JSON array
  category_id TEXT DEFAULT '22',
  privacy_status TEXT NOT NULL DEFAULT 'private', -- private | unlisted | public
  made_for_kids INTEGER NOT NULL DEFAULT 0,
  -- Media in R2
  r2_bucket TEXT,
  r2_key TEXT,
  r2_size_bytes INTEGER,
  source_path TEXT, -- original local/handoff path (optional)
  episode TEXT, -- optional episode label e.g. ep022
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending', -- draft | pending | uploading | published | failed
  youtube_video_id TEXT,
  publish_error TEXT,
  metadata_json TEXT, -- raw handoff metadata snapshot
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE TABLE IF NOT EXISTS youtube_upload_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | succeeded | failed | dry_run
  attempt INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 0,
  request_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_yt_videos_channel ON youtube_videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_yt_videos_status ON youtube_videos(status);
CREATE INDEX IF NOT EXISTS idx_yt_jobs_video ON youtube_upload_jobs(video_id);

-- Seed Empire Oddities channel (no OAuth yet — token_status=missing)
INSERT OR IGNORE INTO youtube_channels (
  id, name, handle, youtube_channel_id, token_status, notes, created_at, updated_at
) VALUES (
  'ytch_empire_oddities',
  'Empire Oddities',
  '@empire.oddities',
  NULL,
  'missing',
  'Seed channel for EO Shorts backlog. Add YouTube OAuth refresh token to enable live publish.',
  unixepoch() * 1000,
  unixepoch() * 1000
);
