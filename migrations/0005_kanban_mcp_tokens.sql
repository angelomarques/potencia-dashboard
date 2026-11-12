-- Per-user bearer tokens for Kanban MCP (/api/kanban/mcp)
CREATE TABLE IF NOT EXISTS kanban_mcp_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_kanban_mcp_tokens_user ON kanban_mcp_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_kanban_mcp_tokens_hash ON kanban_mcp_tokens(token_hash);
