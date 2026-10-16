# help-center-inbox

Signed-in users open `/help-center` and see help-center events from PostHog grouped by project prefix (`lw`, `pf`, `app`, plus any other `*_help_center_submitted` events).

## Story

The user is viewing Help Center Inbox which flows from `/help-center` → `fetchHelpCenterMessages` → PostHog `/query` HogQL → grouped cards.

## Drive

1. Open `/help-center` while signed in.
2. Confirm the heading is **Help Center Inbox**, not **Failed to Load PostHog Messages**.
3. Confirm the error detail `Query has hit the max execution time` is absent.
4. Confirm **Messages by Project** shows a project count and, when events exist, grouped message cards (newest first).
5. Click **Refresh** and confirm the inbox still loads without the timeout.

## Query contract

The HogQL posted to PostHog must:

- `PREWHERE timestamp >= now() - INTERVAL 365 DAY`
- use `event IN (...)` of sanitized `*_help_center_submitted` names
- not scan `events` with unbounded `endsWith(event, '_help_center_submitted')`
