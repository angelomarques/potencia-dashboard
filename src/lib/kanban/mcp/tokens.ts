import { createHash, randomBytes } from "node:crypto";
import { d1Query } from "@/lib/db/d1-http";

export const KANBAN_TOKEN_PREFIX = "kbn_";
const MIN_TOKEN_LENGTH = 24;

export type KanbanMcpActor = {
  userId: string;
  userName: string;
  userEmail: string;
  tokenId: string;
  tokenName: string;
};

export type KanbanMcpAuthResult =
  | { ok: true; actor: KanbanMcpActor }
  | { ok: false; status: 401; code: string };

export type KanbanMcpTokenRecord = {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
};

export type KanbanTokenDeps = {
  query: typeof d1Query;
  now: () => number;
  newId: () => string;
  randomToken: () => string;
};

export const defaultKanbanTokenDeps: KanbanTokenDeps = {
  query: d1Query,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  randomToken: () => `${KANBAN_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`,
};

export function hashMcpToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateMcpToken(deps: KanbanTokenDeps = defaultKanbanTokenDeps): {
  token: string;
  prefix: string;
  hash: string;
} {
  const token = deps.randomToken();
  const prefix = token.slice(0, 12);
  const hash = hashMcpToken(token);
  return { token, prefix, hash };
}

type TokenRow = {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
};

function toRecord(row: TokenRow): KanbanMcpTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
  };
}

export async function createUserMcpToken(
  userId: string,
  name: string,
  overrides: Partial<KanbanTokenDeps> = {},
): Promise<{ record: KanbanMcpTokenRecord; token: string }> {
  const deps: KanbanTokenDeps = { ...defaultKanbanTokenDeps, ...overrides };
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) {
    throw new Error("Token name must be between 1 and 80 characters");
  }

  const id = `kmcp_${deps.newId()}`;
  const now = deps.now();
  const { token, prefix, hash } = generateMcpToken(deps);

  await deps.query(
    `INSERT INTO kanban_mcp_tokens (
      id, user_id, name, token_prefix, token_hash, last_used_at, revoked_at, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
    [id, userId, cleanName, prefix, hash, now],
  );

  return {
    token,
    record: {
      id,
      userId,
      name: cleanName,
      tokenPrefix: prefix,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
    },
  };
}

export async function listUserMcpTokens(
  userId: string,
  overrides: Partial<KanbanTokenDeps> = {},
): Promise<KanbanMcpTokenRecord[]> {
  const deps: KanbanTokenDeps = { ...defaultKanbanTokenDeps, ...overrides };
  const res = await deps.query<TokenRow>(
    `SELECT id, user_id, name, token_prefix, last_used_at, revoked_at, created_at
     FROM kanban_mcp_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId],
  );
  return (res.results || []).map(toRecord);
}

export async function revokeUserMcpToken(
  userId: string,
  tokenId: string,
  overrides: Partial<KanbanTokenDeps> = {},
): Promise<boolean> {
  const deps: KanbanTokenDeps = { ...defaultKanbanTokenDeps, ...overrides };
  const existing = await deps.query<{ id: string; revoked_at: number | null }>(
    "SELECT id, revoked_at FROM kanban_mcp_tokens WHERE id = ? AND user_id = ? LIMIT 1",
    [tokenId, userId],
  );
  const row = existing.results?.[0];
  if (!row) return false;
  if (row.revoked_at !== null) return true;

  await deps.query(
    "UPDATE kanban_mcp_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?",
    [deps.now(), tokenId, userId],
  );
  return true;
}

type AuthLookupRow = {
  token_id: string;
  user_id: string;
  token_name: string;
  user_name: string;
  user_email: string;
};

export async function authenticateKanbanMcpRequest(
  authHeader: string | null | undefined,
  overrides: Partial<KanbanTokenDeps> = {},
): Promise<KanbanMcpAuthResult> {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, code: "missing_authorization" };
  }

  const presented = match[1].trim();
  if (presented.length < MIN_TOKEN_LENGTH) {
    return { ok: false, status: 401, code: "unauthorized" };
  }

  const deps: KanbanTokenDeps = { ...defaultKanbanTokenDeps, ...overrides };
  const tokenHash = hashMcpToken(presented);

  const res = await deps.query<AuthLookupRow>(
    `SELECT
       t.id AS token_id,
       t.user_id AS user_id,
       t.name AS token_name,
       u.name AS user_name,
       u.email AS user_email
     FROM kanban_mcp_tokens t
     INNER JOIN user u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL
     LIMIT 1`,
    [tokenHash],
  );

  const row = res.results?.[0];
  if (!row) {
    return { ok: false, status: 401, code: "unauthorized" };
  }

  // Best-effort last_used_at update; never fail an authorized request if it errors.
  try {
    await deps.query(
      "UPDATE kanban_mcp_tokens SET last_used_at = ? WHERE id = ?",
      [deps.now(), row.token_id],
    );
  } catch (err) {
    console.warn("Failed to update kanban_mcp_tokens.last_used_at:", err);
  }

  return {
    ok: true,
    actor: {
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      tokenId: row.token_id,
      tokenName: row.token_name,
    },
  };
}
