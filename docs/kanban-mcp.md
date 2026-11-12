# Kanban MCP server

Users can connect their AI agents (Antigravity, Cursor, Claude Code, …) to the Potencia Dashboard Kanban boards over MCP while keeping full access to the web UI (`/projects` and `/projects/[projectSlug]`).

- **Endpoint:** `https://dashboard.potenciaapps.com.br/api/kanban/mcp` — MCP **Streamable HTTP**, stateless, JSON responses (`src/app/api/kanban/mcp/route.ts`, `@modelcontextprotocol/sdk`).
- **Auth:** Per-user bearer tokens (`Authorization: Bearer <token>`) stored as SHA-256 hashes in D1 (`kanban_mcp_tokens`, see `migrations/0005_kanban_mcp_tokens.sql`).
- **Shared domain layer:** Both the web REST routes (`/api/cards/*`) and the MCP server execute against `src/lib/kanban/service.ts` with atomic `d1Batch` moves/reordering.

## Tools

| Tool | What it does |
|---|---|
| `list_projects` | Lists registered Kanban projects (`slug`, `name`, `boardId`) and their status columns (`id`, `name`, `position`). |
| `list_tasks` | Retrieves tasks for a project (`projectSlug`, default `'lawa'`), with optional `status` (column name or ID), `priority`, `search`, and `limit` filters. |
| `get_task` | Retrieves a single task by `cardId`. |
| `create_task` | Creates a new task (`projectSlug?`, `title`, `description?`, `status?` defaulting to `'To do'`, `priority?`, `position?` `'top'\|'bottom'`), attributed to the token owner (`created_by`). |
| `change_task_status` | Moves a task to a destination `status` (column name like `'In Progress'` / `'Done'` or `columnId`) and optional `position` (`'top'\|'bottom'\|number`). |
| `update_task` | Updates `title`, `description`, `priority`, and/or `status` of an existing task. |

## Managing Per-User Tokens

1. Apply the D1 migration:
   ```bash
   pnpm db:migrate:kanban-mcp
   ```
2. Sign in to the dashboard, open `/projects` or any project board (`/projects/lawa`), and click **MCP Access**.
3. Generate a token (e.g. `Antigravity` or `Cursor`), copy the token once, or copy the pre-filled client config snippet. Tokens can be revoked at any time from the same dialog.

## Antigravity (`mcp_config.json`)

```json
{
  "mcpServers": {
    "potencia-kanban": {
      "serverUrl": "https://dashboard.potenciaapps.com.br/api/kanban/mcp",
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
    "potencia-kanban": {
      "url": "https://dashboard.potenciaapps.com.br/api/kanban/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KANBAN_MCP_TOKEN>"
      }
    }
  }
}
```

## Verification

- Unit & in-memory SQLite integration tests: `pnpm test:kanban` (`src/lib/kanban/__tests__/mcp.test.ts`).
