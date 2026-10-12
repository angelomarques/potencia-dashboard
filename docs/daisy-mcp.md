# Daisy Studio MCP server

Coding agents (Cursor, Antigravity, Claude Code, …) can push design/sketch run results straight into
Daisy Studio (`/daisy`) and read the owner's feedback, over MCP.

- **Endpoint:** `https://dashboard.potenciaapps.com.br/api/mcp` — MCP **Streamable HTTP**, stateless, JSON responses
  (`src/app/api/mcp/route.ts`, official `@modelcontextprotocol/sdk`).
- **Auth:** per-agent bearer token: `Authorization: Bearer <token>`.
- **Writes reuse the webhook domain path:** every write tool builds a normal inbound event
  (`project.upserted`, `sketch.created`, `sketch.updated`, `message.created`), validates it with
  `inboundEventSchema` and applies it through `applyInboundEvent()` in `src/lib/daisy/inbound.ts`, the same function
  the signed webhook uses. That means the same idempotency (event ids `mcp_<agent>_<uuid>`), the same auto-created
  projects, and the same `(projectId, sketchId)` upsert. The HMAC check is skipped because the bearer token
  authenticates the call.

## Tools

| Tool | What it does |
|---|---|
| `list_projects` | Lists projects (optional `status` filter). |
| `upsert_project` | Creates or updates `{projectId, name, status?, summary?, currentSection?}`. |
| `push_sketch` | Adds a sketch, or replaces one with the same `sketchId`. Give **one** image source: `imageUrl` (https, used as-is), `imageBase64` (raw + `contentType`, or a `data:` URL), or `sourceUrl` (the server fetches it and re-hosts it). Uploaded images go to the public R2 bucket `daisy-sketches` at `<project>/<round>/<file>` (`round` defaults to `r1`). Optional: `groupId` (alternatives to choose between), `section`, `kind` (`card`/`slide`), `url` (live page). Max 10 MB; png/jpeg/webp/gif/svg. |
| `update_sketch` | Partial update of an existing sketch. Fields you leave out keep their current value. |
| `post_message` | Posts a run summary to the project chat, shown as `[<agent>] …`. Optional `idempotencyKey` makes retries post only once. |
| `get_feedback` | Returns owner chat messages, comments per sketch (with optional `x`/`y` pin, 0..1), sketch status (`chosen`/`rejected`/`proposed`) and gates (notes, references). It also returns a `cursor`: pass it back as `since` to get only new feedback. |

## Auth model and env vars

| Variable | Required | Notes |
|---|---|---|
| `DAISY_MCP_TOKENS` | yes (else 503) | Comma-separated `agent:token` pairs, e.g. `cursor:<token>,antigravity:<token>`. Tokens must be ≥ 24 chars (`openssl rand -hex 32`). The agent name is attached to event ids and chat messages. Remove an entry to revoke that agent. Tokens are compared in constant time. |
| `DAISY_SKETCH_R2_BUCKET` | no | Defaults to `daisy-sketches`. |
| `DAISY_SKETCH_CF_API_TOKEN` | for uploads (preferred) | Cloudflare API token with R2 object write on the sketch bucket (+ `CLOUDFLARE_ACCOUNT_ID`). Uploads go through the Cloudflare R2 REST API. When unset, the S3 keys below are used. |
| `DAISY_SKETCH_PUBLIC_BASE_URL` | no | Defaults to `https://pub-e166bf4d036c4ac2b730b8ad9f9deb02.r2.dev`. |
| `CLOUDFLARE_R2_*` / `R2_*` | fallback for uploads | The existing R2 credentials (`src/lib/r2/config.ts`). The key must be allowed to **write** the `daisy-sketches` bucket. Without them, `imageUrl` still works and uploads return `upload_failed: r2_not_configured`. |

Requests share the `inbound` rate limit with the webhooks. Bad or missing token → `401`; no tokens configured → `503`.

## Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "daisy-studio": {
      "url": "https://dashboard.potenciaapps.com.br/api/mcp",
      "headers": { "Authorization": "Bearer ${env:DAISY_MCP_TOKEN}" }
    }
  }
}
```

Put the token in `DAISY_MCP_TOKEN` in your shell env. You can also paste it in place of the variable, but don't commit it.

## Antigravity (`mcp_config.json`)

Open it from Agent panel → … → MCP Servers → Manage MCP Servers → View raw config. Global: `~/.gemini/config/mcp_config.json` (older builds use `~/.gemini/antigravity/mcp_config.json`). Per workspace: `.agents/mcp_config.json`. Antigravity uses `serverUrl`, not `url`.

```json
{
  "mcpServers": {
    "daisy-studio": {
      "serverUrl": "https://dashboard.potenciaapps.com.br/api/mcp",
      "headers": { "Authorization": "Bearer <antigravity token>" }
    }
  }
}
```

## Optional stdio fallback (local image files)

A remote server can't read files on your disk, and asking the model to emit base64 wastes context. To push local
files, use the small stdio proxy `scripts/daisy-mcp-stdio.mjs`. It forwards every tool to the remote endpoint and adds
`filePath` to `push_sketch`. The proxy reads the file and sends it as base64. Run it from a checkout of this repo after
`pnpm install`:

```json
{
  "mcpServers": {
    "daisy-studio": {
      "command": "node",
      "args": ["/path/to/potencia-dashboard/scripts/daisy-mcp-stdio.mjs"],
      "env": { "DAISY_MCP_TOKEN": "<token>", "DAISY_MCP_URL": "https://dashboard.potenciaapps.com.br/api/mcp" }
    }
  }
}
```

## Prompt snippet: "when done, push results to Daisy Studio"

```text
When you finish a sketch/design run, push the results to Daisy Studio with the `daisy-studio` MCP tools:
1. upsert_project { projectId: "<slug>", name: "<name>", currentSection: "<section>" }.
2. For each sketch: push_sketch { projectId, sketchId: "<stable id>", label, section, groupId: "<group>" when they are
   alternatives, round: "r<N>", and one of imageUrl | filePath (stdio) | imageBase64 }.
3. post_message { projectId, idempotencyKey: "<run id>", body: a 3–6 line summary of what you made and what to choose }.
Before the next iteration, call get_feedback { projectId, since: <cursor from last time> } and act on the owner's
comments, chosen/rejected sketches and gate notes. Reuse sketchIds when you revise a sketch.
```

## Verification

- Unit tests: `pnpm test:daisy`. `src/lib/daisy/__tests__/mcp.test.ts` covers auth parsing, R2 key/base64 helpers,
  and every tool end-to-end over an in-memory MCP transport through the real `applyInboundEvent`.
- E2E: the `.cursor/skills/prove-daisy-mcp` skill (local D1 mock + `next dev` + real MCP HTTP and stdio clients +
  Playwright). Evidence is in `docs/evidence/daisy-mcp/`.
