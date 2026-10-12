---
name: prove-daisy-mcp
description: End-to-end prove for the Daisy Studio MCP endpoint (/api/mcp) — bearer auth, all tools over real Streamable HTTP + the stdio proxy, R2 upload, UI render and owner feedback round-trip via get_feedback.
---

# Prove Daisy MCP

Builds on `prove-daisy-studio` (same D1 mock + migrations). Never paste secret values.

```bash
S=.cursor/skills/prove-daisy-studio/scripts
DB_PATH=/tmp/daisy-mcp.db node $S/d1-mock.mjs &
DB_PATH=/tmp/daisy-mcp.db node $S/apply.mjs migrations/0001_init.sql migrations/0003_daisy.sql migrations/0004_daisy_sketch_scope.sql
# env as in prove-daisy-studio, plus random DAISY_MCP_TOKENS=cursor:<hex>,antigravity:<hex>
# R2: source creds (e.g. georealty-prove-r2.env). If the key can't write daisy-sketches, set
#     DAISY_SKETCH_R2_BUCKET=<writable bucket>; the script then checks the object with HeadObject instead of the public URL.
pnpm exec next dev --port 43211 &
SAMPLE_PNG=/tmp/mcp-sample.png node .cursor/skills/prove-daisy-mcp/scripts/validate-mcp.mjs   # "ALL PASS"
```

Checks: 401 without or with a wrong token; tools/list for two agents; upsert_project/list_projects; push_sketch via imageUrl,
base64→R2 (`<project>/<round>/<file>`), and the stdio proxy `filePath`; http image rejected; update_sketch partial and unknown;
post_message attributed + idempotent; UI renders sketches/messages; owner chooses, comments and chats; get_feedback returns them
and the cursor yields nothing new. Evidence → `/workspace/daisy-mcp-evidence/`.
