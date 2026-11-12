# new-potencia-stack

Mint a new Potencia web app from the `angelomarques/potencia-stack` GitHub template.

## When to use
Creating a new Next.js Potencia app with optional packs (auth, orpc, redis, turnstile, d1, posthog, cf-cron, cf-queues).

## Steps
1. **Clone template** (SSH):
   ```bash
   export GIT_SSH_COMMAND='ssh -i /home/box/agent-data/secrets/ssh/id_ed25519_github -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
   git clone git@github.com:angelomarques/potencia-stack.git /tmp/potencia-stack-src
   cd /tmp/potencia-stack-src
   pnpm install
   ```
2. **Scaffold** with feature flags (example: auth+redis, no queues):
   ```bash
   pnpm scaffold -- --name my-app --with-auth --with-redis --without-cf-queues --without-cf-cron
   ```
   Scaffold sets **`NEXT_PUBLIC_EVENT_PREFIX`** in `.env.example` (and `eventPrefix` in `potencia.packs.json`) from the app name:
   - `kingdom-movies` → `km`
   - `potencia-dashboard` → `pd`
   - single-segment names → first 3 letters
   Never leave the template placeholder `app` on a real product, and never hardcode Lawa’s `lw`.
3. **Create GitHub repo + push**:
   ```bash
   source /home/box/agent-data/secrets/gh.env   # never paste token
   cd ../my-app
   git init -b main
   git add -A && git commit -m "chore: scaffold from potencia-stack"
   gh repo create <owner>/my-app --private --source=. --remote=origin --push
   ```
   Or: `gh repo create my-app --private --template angelomarques/potencia-stack --clone` then re-run scaffold overlays if packs differ; still set `NEXT_PUBLIC_EVENT_PREFIX` uniquely.
4. **Vercel**: `vercel link` / import repo; copy keys from `.env.example` into project env (do not echo secrets). Include `NEXT_PUBLIC_EVENT_PREFIX`.
5. **Upstash**: Marketplace → Redis if `redis` pack enabled.
6. **Forms**: follow `.cursor/rules/forms.mdc` — always react-hook-form + zod + shadcn `Form*` (see sign-in at `src/app/(auth)/sign-in/page.tsx`).
7. **Verify**: follow `verify-potencia-stack` skill (`pnpm run doctor`, `pnpm build`).

## Pack defaults
See `packs/defaults.json`: orpc/auth/posthog/turnstile/d1/redis ON; cf-cron/cf-queues OFF.

## Env
Single file `src/env.ts`. Packs document schema fragments in `packs/*/pack.json` → `env`.
Server analytics: `src/lib/analytics.ts` (`Analytics.track/identify/shutdown/isInitialized`) prefixes events with `NEXT_PUBLIC_EVENT_PREFIX`.
