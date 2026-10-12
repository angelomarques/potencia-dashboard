import { timingSafeEqualString } from "@/lib/daisy/pull";

/**
 * Per-agent bearer tokens for the Daisy MCP endpoint.
 *
 * DAISY_MCP_TOKENS = "cursor:<token>,antigravity:<token>"
 * Each entry is "<agent-name>:<token>". The agent name is attributed on every
 * write (event ids, chat messages) so you can tell which agent pushed what,
 * and a single agent can be revoked by removing its entry.
 */
export type McpAgent = { name: string };

export type McpAuthResult =
  | { ok: true; agent: McpAgent }
  | { ok: false; status: 401 | 503; code: string };

const AGENT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const MIN_TOKEN_LENGTH = 24;

export function parseMcpTokens(raw: string | undefined): { name: string; token: string }[] {
  if (!raw) return [];
  const out: { name: string; token: string }[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    const i = entry.indexOf(":");
    if (i <= 0) continue;
    const name = entry.slice(0, i).trim();
    const token = entry.slice(i + 1).trim();
    if (!AGENT_NAME.test(name) || token.length < MIN_TOKEN_LENGTH) continue;
    out.push({ name, token });
  }
  return out;
}

export function verifyMcpAuth(
  authHeader: string | null | undefined,
  rawTokens: string | undefined
): McpAuthResult {
  const tokens = parseMcpTokens(rawTokens);
  if (tokens.length === 0) return { ok: false, status: 503, code: "daisy_mcp_not_configured" };
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, code: "missing_authorization" };
  const presented = match[1].trim();
  // Compare against every entry (no early exit) to keep timing uniform.
  let found: string | null = null;
  for (const t of tokens) {
    if (timingSafeEqualString(presented, t.token) && !found) found = t.name;
  }
  if (!found) return { ok: false, status: 401, code: "unauthorized" };
  return { ok: true, agent: { name: found } };
}
