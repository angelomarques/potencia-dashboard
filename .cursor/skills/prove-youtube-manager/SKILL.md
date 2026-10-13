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
6. Presigns a GetObject URL and Range-GETs the first 1KB (same mechanism as UI Preview). Skipped when S3 keys are absent and Wrangler is used for R2.
7. Deletes the prove object from R2 (`HeadObject` 404 / Wrangler get-not-found) then the D1 video + jobs rows (same order as product delete).
8. Writes `artifacts/<slug>/report.json` and prints **PASS** / **FAIL**.

R2 access: S3-compatible client when `CLOUDFLARE_R2_ACCESS_KEY_ID` + secret are set; otherwise Wrangler `r2 object` with `CLOUDFLARE_API_TOKEN`. Bucket from `CLOUDFLARE_R2_BUCKET` or an existing `youtube_videos.r2_bucket`.

Optional: after EO import, set `PROVE_EO_EPISODE=ep022` to assert that episode’s R2 key exists.
