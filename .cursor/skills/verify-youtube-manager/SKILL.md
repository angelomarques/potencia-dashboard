---
name: verify-youtube-manager
description: Verify Potencia Dashboard YouTube Manager UI (channels, R2 upload, pending queue, dry-run publish) with Playwright.
---

# Verify YouTube Manager

Feature surface: `/youtube` (channels) and `/youtube/[channelId]` (upload + pending + publish).

Requires authenticated session (better-auth). For agent proves prefer the headless `prove-youtube-manager` skill (D1+R2, no browser login).

## Feature IDs

| ID | What |
| --- | --- |
| `yt-channels-shell` | `/youtube` lists channels + add form |
| `yt-channel-detail` | Channel detail shows OAuth badge + upload form |
| `yt-upload-pending` | Upload creates pending row with r2_key |
| `yt-dry-run-publish` | Dry-run publish returns mode=dry_run |
| `yt-preview-video` | Preview button → signed R2 URL → inline `<video controls>` |

## Scripts

```bash
.cursor/skills/verify-youtube-manager/scripts/doctor.sh
.cursor/skills/verify-youtube-manager/scripts/launch.sh   # next dev on VERIFY_PORT (default 43210)
.cursor/skills/verify-youtube-manager/scripts/cleanup.sh
```

Drive features after login (manual cookie or existing session):

```bash
.cursor/skills/verify-youtube-manager/scripts/drive-features.mjs yt-channels-shell
```

## Env

Source `/home/box/agent-data/secrets/potencia-dashboard.env` plus R2 (`georealty-prove-r2.env` or `r2.env`). Never paste secret values.
