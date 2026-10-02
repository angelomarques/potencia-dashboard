---
name: prove-youtube-manager
description: One-shot prove that YouTube Manager R2 objects exist and D1 metadata is wired; dry-run publish when OAuth missing.
---

# Prove YouTube Manager

```bash
.cursor/skills/prove-youtube-manager/scripts/prove.sh
```

What it does:

1. Confirms D1 tables `youtube_channels` / `youtube_videos` exist (migration applied).
2. Uploads a tiny fixture MP4 to R2 under `potencia-dashboard/youtube/_prove/…`.
3. Inserts a pending `youtube_videos` row with title/description metadata.
4. `HeadObject` proves R2 object exists and size &gt; 0.
5. Dry-run publish path (or SQL-level dry_run job) succeeds without YouTube OAuth.
6. Writes `artifacts/<slug>/report.json` and prints **PASS** / **FAIL**.

Optional: after EO import, set `PROVE_EO_EPISODE=ep022` to assert that episode’s R2 key exists.
