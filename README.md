# Potencia Dashboard

Greenfield kanban (Trello/ClickUp-style) for tracking product work. V1 ships the **Lawa** board; the schema is multi-app ready.

## Stack

- Next.js App Router
- Cloudflare D1 (via REST/HTTP API from Vercel)
- better-auth (email/password)
- Cloudflare Turnstile on signup
- shadcn/ui + @dnd-kit

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill values
pnpm dev
```

## Scripts

- `pnpm dev` — local server
- `pnpm build` — production build
- `pnpm start` — start production server

## License

Private / proprietary unless otherwise noted.

## YouTube Manager

Multi-channel YouTube queue inside the dashboard (`/youtube`).

- Media files live on **Cloudflare R2** (prefix `potencia-dashboard/youtube/…`).
- D1 tables: `youtube_channels`, `youtube_videos`, `youtube_upload_jobs` (`migrations/0002_youtube.sql`).
- Publish uses YouTube Data API when `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` and a channel refresh token are set; otherwise **dry-run** only.

### Apply migration

```bash
set -a; source /home/box/agent-data/secrets/potencia-dashboard.env; set +a
pnpm db:migrate:youtube
```

### Add a channel

1. Sign in → **YouTube** in the header → fill **Add channel** (name + optional handle).
2. To enable live publish later: `PATCH /api/youtube/channels/:id` with `{ "refreshToken": "<oauth refresh token>" }` (encrypted at rest). Or document the token in a secrets file Ari provisions — never commit it.

### Import Empire Oddities handoffs (ep022+)

```bash
set -a
source /home/box/agent-data/secrets/potencia-dashboard.env
source /home/box/agent-data/secrets/georealty-prove-r2.env
set +a
pnpm youtube:import-eo -- --from 22
# dry-run first: pnpm youtube:import-eo -- --from 22 --dry-run
```

Prefer `*_playable.mp4` when present. Idempotent per `episode` on channel `ytch_empire_oddities`.

### Prove

```bash
pnpm prove:youtube
# After EO import: PROVE_EO_EPISODE=ep022 pnpm prove:youtube
```

Skills: `.cursor/skills/verify-youtube-manager`, `.cursor/skills/prove-youtube-manager`.

### Vercel env checklist (names only)

- Existing: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`, auth/Turnstile
- Add: `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ENDPOINT`
- Optional live publish: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_TOKEN_KEY`
