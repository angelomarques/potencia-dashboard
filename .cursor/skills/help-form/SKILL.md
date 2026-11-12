---
name: help-form
description: Use when adding or changing a help / support / contact form in a Potencia app whose submissions must appear in the potencia-dashboard Help Center inbox. Covers the PostHog event contract, EVENT_PREFIX, oRPC handler, RHF+zod dialog, env vars, verification and pitfalls.
---

# help-form

Potencia apps do **not** store help-center messages in their own DB. A submission is a
**server-side PostHog event**; `potencia-dashboard` (`/help-center`) queries PostHog with
HogQL and lists every app's messages grouped by prefix.

Reference implementation in this template (already wired):

| Piece | File |
|---|---|
| zod schema | `src/lib/validation/help-center.ts` |
| oRPC procedure `support.helpCenterSubmit` | `src/lib/orpc/router.ts` |
| Server capture (`Analytics.track`, adds prefix) | `src/lib/analytics.ts` |
| Dialog UI (RHF + zod + shadcn Form) | `src/components/help-center-dialog.tsx` |
| Mounted on | `src/app/page.tsx` |

Real consumer example: `<org>/<app>` (`src/server/orpc/router.ts` → `helpCenterSubmit`).

## How the dashboard reads it (contract, from potencia-dashboard `src/lib/posthog/help-center.ts`)

```sql
SELECT event, distinct_id, timestamp,
       properties.email AS email,
       properties.message AS message,
       properties.accountEmail AS accountEmail
FROM events
WHERE endsWith(event, '_help_center_submitted')
ORDER BY timestamp DESC LIMIT 200
```

- Endpoint: `POST {host}/api/projects/{POSTHOG_PROJECT_ID}/query/` (Potencia project **75942**), `Authorization: Bearer POSTHOG_PERSONAL_API_KEY`, `cache: no-store`.
- **Project grouping** = event name minus suffix `_help_center_submitted` (`lw_help_center_submitted` → `lw`). That is the only way projects are separated, so the prefix must be unique per app.
- Only the latest **200** events across all apps are shown.
- No status / read / reply workflow exists: the inbox is read-only (refresh button = `router.refresh()`). Reply by emailing the `email` property manually.

### Event contract (must match exactly)

| Field | Value | Shown as |
|---|---|---|
| event | `${NEXT_PUBLIC_EVENT_PREFIX}_help_center_submitted` | badge + group |
| distinctId | the user id (`session.user.id`) | "id" |
| `properties.email` | contact email typed in the form | Email |
| `properties.message` | message body (plain text, newlines kept) | Message |
| `properties.accountEmail` | signed-in account email (camelCase! `account_email` is only tolerated on object rows, not by the HogQL query) | Account email |
| `properties.messageLength` | optional extra, not displayed | — |

Any extra properties are fine but invisible in the dashboard.

## Implementation steps (new app or new form)

1. **Prefix** — set `NEXT_PUBLIC_EVENT_PREFIX` (lowercase slug, ≤16 chars, validated in `src/env.ts`). `pnpm scaffold -- --name <app>` derives it. Never leave `app` in production; never reuse another app's prefix (`lw` = Lawa).
2. **Schema** — reuse/extend `helpCenterInputSchema`. Keep the keys `email` and `message`.
3. **Server** — call `Analytics.track` from an oRPC handler (server only; `analytics.ts` is `server-only`). Pass the **unprefixed** name `help_center_submitted`; `Analytics.track` prepends the prefix:
   ```ts
   await Analytics.track({
     distinctId: user.id,
     event: "help_center_submitted",
     properties: {
       email: input.email,
       message: input.message,
       messageLength: input.message.length,
       accountEmail: user.email,
     },
   });
   await Analytics.shutdown(); // flush before the serverless function exits
   ```
   The template procedure requires a better-auth session (throws `UNAUTHORIZED`).
4. **Client** — follow `.cursor/rules/forms.mdc`: `useForm` + `zodResolver(helpCenterInputSchema)` + shadcn `Form*`; submit with `orpc.support.helpCenterSubmit(values)`. Copy `HelpCenterDialog` rather than writing a new form.
5. **Anonymous / public form (optional)** — if there is no session:
   - use a stable `distinctId` (e.g. `posthog.get_distinct_id()` passed in input, or `anon:${email}`) and send `accountEmail: null`;
   - add a Turnstile token to the schema and check it with `verifyTurnstileToken(token, ip)` (`src/lib/auth/turnstile.ts`, widget `src/components/auth/turnstile-widget.tsx`, turnstile pack);
   - rate limit with `checkRateLimit(\`help:${ip}\`)` from `src/lib/rate-limit.ts` (redis pack) and throw `ORPCError("TOO_MANY_REQUESTS")` when `!allowed`.
6. Do **not** capture the event from the browser with `posthog-js` — client capture can be blocked by ad blockers and lets anyone forge messages.

## Env vars

App (sender):
- `NEXT_PUBLIC_POSTHOG_KEY` — project 75942 API key (the shared Potencia project). Missing ⇒ `Analytics.track` silently no-ops.
- `NEXT_PUBLIC_POSTHOG_HOST` — default `https://us.i.posthog.com`.
- `NEXT_PUBLIC_EVENT_PREFIX` — unique per app.
- Optional: `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Upstash/KV vars + `RATE_LIMIT_PER_MINUTE`.

Dashboard (reader, already configured there): `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID=75942`, `NEXT_PUBLIC_POSTHOG_UI_HOST` (or derived from `NEXT_PUBLIC_POSTHOG_HOST`: `us.i.posthog.com` → `https://us.posthog.com`).

## Verify

1. `pnpm doctor` (verify-potencia-stack) — includes `help-center-*` checks; `pnpm typecheck`.
2. Run the app with real PostHog env, sign in, submit the dialog; expect "Message sent successfully!".
3. PostHog → project 75942 → Activity: event `<prefix>_help_center_submitted` with `email`, `message`, `accountEmail`.
4. potencia-dashboard → `/help-center` → Refresh: a group badge with your prefix contains the message.

## Pitfalls

- Wrong key or wrong project ⇒ event lands elsewhere; the dashboard only reads project 75942.
- Missing `NEXT_PUBLIC_POSTHOG_KEY` ⇒ no error, no event.
- Prefixing twice (`event: "lw_help_center_submitted"` into `Analytics.track`) ⇒ `lw_lw_help_center_submitted` → group `lw_lw`.
- Suffix typos (`help_centre_submitted`, `helpcenter_submitted`) ⇒ invisible to the `endsWith` filter.
- `account_email` / `body` / `text` keys ⇒ blank fields in the inbox.
- Skipping `Analytics.shutdown()` on serverless ⇒ events dropped.
- Shared prefix between apps ⇒ messages merged into one group.
- Never paste PostHog keys into commits, PRs or chat.
