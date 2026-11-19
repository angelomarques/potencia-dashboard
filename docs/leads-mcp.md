# Leads MCP server

Users can connect their AI agents (Antigravity, Cursor, Claude Code, …) to the Potencia Dashboard Lead Outbound Tracker & Pipeline Reporting over MCP while keeping full access to the web UI (`/leads`).

- **Endpoint:** `https://dashboard.potenciaapps.com.br/api/leads/mcp` — MCP **Streamable HTTP**, stateless, JSON responses (`src/app/api/leads/mcp/route.ts`, `@modelcontextprotocol/sdk`).
- **Auth:** Per-user bearer tokens (`Authorization: Bearer <token>`) stored as SHA-256 hashes in D1 (`kanban_mcp_tokens`, see `migrations/0005_kanban_mcp_tokens.sql`). Authenticates with the **same** tokens as the Kanban MCP server via `authenticateKanbanMcpRequest` — no separate token management or migrations required.
- **Shared domain layer:** Both the web REST routes (`/api/leads/*`) and the MCP server execute against the shared domain layer: `src/lib/leads/repo.ts`, `src/lib/leads/report.ts`, `src/lib/leads/types.ts`, and `src/lib/projects/registry.ts`.

## Tools

| Tool | What it does |
|---|---|
| `list_projects` | Lists registered dashboard projects (`slug`, `name`, `tagline`, `boardId`). |
| `create_project` | Creates a new dashboard project (`name`, `slug?`, `tagline?`) with default Kanban columns, attributed to the token owner (`createdBy = actor.userId`). |
| `list_leads` | Retrieves outbound leads with optional filtering by `projectSlug`, `status` (`new`, `contacted`, `replied`, `meeting_booked`, `won`, `lost`), substring `search`, and `limit` (1..500, default 100). |
| `get_lead` | Retrieves a single lead by `leadId` along with its complete chronological outreach interaction logs. |
| `find_lead_by_email` | Searches leads matching `email` (case-insensitive, trimmed). With `projectSlug`: scoped to that project; without: across all projects. Returns `{ found, leads }`. |
| `create_lead` | Creates a new lead in `projectSlug` (required, must exist in registry). Supports email deduplication via `onDuplicate` (`return_existing` or `error`), initial status, notes, follow-up date, and an optional `initialApproach` logged immediately. Attributed to the token owner (`createdBy = actor.userId`). |
| `update_lead` | Updates any lead metadata, status, `nextFollowUpAt`, or `lastContactedAt`. Unspecified fields remain unchanged. |
| `delete_lead` | Deletes a lead by `leadId` and cascades to delete all its outreach logs. |
| `log_approach` | Logs an outreach touch (`channel`, `direction`, `outcome`, `subject?`, `message?`, `approachedAt?`, `nextFollowUpAt?`, `autoUpdateStatus?`, `explicitStatus?`) with same semantics as `POST /api/leads/[id]/logs`. Updates `last_contacted_at` and automatically advances status based on outcome progression. Returns `{ log, lead, previousStatus }`. |
| `list_lead_logs` | Retrieves all outreach interaction logs for a specific `leadId` in reverse chronological order. |
| `delete_lead_log` | Deletes an outreach log entry by `logId` from a `leadId` and recalculates the lead's `last_contacted_at`. |
| `leads_report` | Computes full funnel metrics, stage counts, reply/conversion percentages, and follow-up queues for a given `projectSlug` (or across all projects). |

## Deduplication Behavior

When creating a lead via `create_lead`:
- If an `email` is provided, the server checks for an existing lead with the same email (trimmed, case-insensitive) within the target `projectSlug`.
- **`onDuplicate: "return_existing"`** (default): Does not insert a duplicate. Returns `{ created: false, duplicate: true, lead: existingLead }`.
- **`onDuplicate: "error"`**: Returns an error (`isError: true`) with a message containing `"already exists"` and the existing lead ID.

## Timestamp Formats

- **Inputs:** Timestamps accept ISO 8601 strings (e.g. `"2026-11-18T20:00:00.000Z"`) or epoch millisecond numbers (e.g. `1763500800000`). Invalid formats return a clear error.
- **Outputs:** Every timestamp field is returned in two formats: as an ISO 8601 string and as epoch milliseconds (e.g. `createdAt` ISO string and `createdAtMs` number; `nextFollowUpAt` and `nextFollowUpAtMs`; `approachedAt` and `approachedAtMs`). Null values remain `null`.

## Managing Per-User Tokens

1. Sign in to the dashboard, open `/leads` (or `/projects`), and click **MCP Access**.
2. Generate a token (e.g. `Antigravity` or `Cursor`), copy the token once, or copy the pre-filled client config snippet. Tokens can be revoked at any time from the same dialog.

## Antigravity (`mcp_config.json`)

```json
{
  "mcpServers": {
    "potencia-leads": {
      "serverUrl": "https://dashboard.potenciaapps.com.br/api/leads/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KANBAN_MCP_TOKEN>"
      }
    }
  }
}
```

## Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "potencia-leads": {
      "url": "https://dashboard.potenciaapps.com.br/api/leads/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KANBAN_MCP_TOKEN>"
      }
    }
  }
}
```

## Verification

- Unit & in-memory SQLite integration tests: `pnpm test:leads-mcp` (`src/lib/leads/__tests__/mcp.test.ts`).

### Local end-to-end evidence

Runs entirely locally (never against production D1):

```bash
S=.cursor/skills/prove-daisy-studio/scripts
DB_PATH=/tmp/leads-mcp.db node $S/d1-mock.mjs &
node $S/apply.mjs migrations/0001_init.sql migrations/0002_add_todo_column.sql migrations/0005_kanban_mcp_tokens.sql migrations/0006_leads_outbound.sql
# env: D1_HTTP_BASE_URL=http://127.0.0.1:8788 CLOUDFLARE_ACCOUNT_ID/D1_DATABASE_ID/CLOUDFLARE_API_TOKEN=local,
#      BETTER_AUTH_SECRET=<random>, BETTER_AUTH_URL=http://localhost:43213
pnpm exec next dev --port 43213 &
BASE=http://localhost:43213 node docs/pr-evidence/leads-mcp/capture-transcript.mjs
```

The script signs up a local user, mints a token through `/api/kanban/mcp/tokens`, and writes a redacted JSON-RPC transcript to `docs/pr-evidence/leads-mcp/mcp-transcript.json`.

Note: dedupe is a read-before-insert check in the domain layer (`findLeadByEmail`), not a database unique constraint, so two concurrent `create_lead` calls with the same email could both insert. Leads without an email are never deduped.
