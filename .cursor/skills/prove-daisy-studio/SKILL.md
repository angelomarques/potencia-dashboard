---
name: prove-daisy-studio
description: End-to-end prove for the Daisy design studio (/daisy) — signed inbound webhooks, UI flows (Playwright), outbound push + pull/ack — against a local D1 HTTP mock.
---

# Prove Daisy studio

Runs fully locally: a node:sqlite D1 HTTP mock (`D1_HTTP_BASE_URL`), `next dev`, a mock Daisy receiver that verifies our outbound HMAC, and a Playwright driver. R2 reference upload uses real R2 creds if sourced (e.g. `georealty-prove-r2.env`); never paste secret values.

```bash
S=.cursor/skills/prove-daisy-studio/scripts
node $S/d1-mock.mjs &                       # :8788, DB_PATH=/tmp/daisy-local.db
node $S/apply.mjs migrations/0001_init.sql migrations/0003_daisy.sql
# env: D1_HTTP_BASE_URL=http://127.0.0.1:8788 CLOUDFLARE_ACCOUNT_ID/D1_DATABASE_ID/CLOUDFLARE_API_TOKEN=local
#      BETTER_AUTH_SECRET, BETTER_AUTH_URL=http://localhost:43211, DAISY_WEBHOOK_SECRET, DAISY_PULL_TOKEN (random),
#      DAISY_OWNER_EMAIL=angelo@example.com, DAISY_WEBHOOK_URL=http://127.0.0.1:8799/daisy-hook (+ R2 vars)
pnpm exec next dev --port 43211 &
node $S/receiver.mjs &                      # :8799, writes outbound-received.jsonl
node $S/validate.mjs                        # needs playwright-core; prints PASS/FAIL per check, "ALL PASS"
```

Checks: inbound for every event type; valid signature accepted; replay -> `duplicate:true`; bad signature / stale timestamp / missing signature -> 401; disallowed or http preview -> 422; projects list; thread; choose sketch (chosen/rejected); pinned comment; gate reference upload (R2) + submit; gate Continue; allowed preview iframe (sandboxed) vs blocked stored origin; outbound push signatures valid for all owner.* types; pull bearer 200/401; ack drains. Evidence -> `/workspace/daisy-studio-evidence/`.

Unit tests: `pnpm test:daisy` (vitest).
