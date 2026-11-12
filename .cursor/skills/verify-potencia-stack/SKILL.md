# verify-potencia-stack

Doctor + smoke for the potencia-stack template (and scaffolded apps).

## Feature IDs
- `core-build` — `pnpm install && pnpm build`
- `env-module` — `src/env.ts` present with createEnv
- `pnpm-only` — packageManager field + lockfile
- `scaffold-auth-redis` — scaffold with auth+redis without cf-queues
- `health-route` — `/api/health` returns ok
- `forms-rule` — `.cursor/rules/forms.mdc` + shadcn Form + RHF sign-in
- `analytics-module` — `src/lib/analytics.ts` with EVENT_PREFIX from env (not hardcoded `lw`)
- `help-center` — help-form skill/rule + `support.helpCenterSubmit` emits `help_center_submitted` with `accountEmail`
- `event-prefix-env` — `NEXT_PUBLIC_EVENT_PREFIX` in `src/env.ts` + `.env.example`
- `http-axios` — `.cursor/rules/http-axios.mdc`, axios dep, `src/lib/http/{external,internal}.ts`, ESLint fetch ban, no raw `fetch(` in src/packs

## Scripts
- `scripts/doctor.sh` — static checks
- `scripts/smoke.sh` — build + optional playwright
- `scripts/cleanup.sh` — remove .next / artifacts

## Usage
```bash
pnpm doctor
pnpm smoke
```
