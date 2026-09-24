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
