#!/usr/bin/env node
/**
 * Import Empire Oddities handoffs ep022+ into R2 + D1 pending queue.
 *
 * Usage (from repo root, with secrets sourced):
 *   set -a; source /home/box/agent-data/secrets/potencia-dashboard.env
 *   source /home/box/agent-data/secrets/georealty-prove-r2.env; set +a
 *   node scripts/import-eo-handoffs.mjs [--from 22] [--dry-run] [--handoff-root PATH]
 *
 * Prefer *_playable.mp4 when present and size > 0.
 * Never prints secret values.
 */
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

function env(name, ...alts) {
  for (const n of [name, ...alts]) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

function requireEnv(name, ...alts) {
  const v = env(name, ...alts);
  if (!v) throw new Error(`Missing env: ${[name, ...alts].join(" / ")}`);
  return v;
}

async function d1Query(sql, params = []) {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const dbId = requireEnv("D1_DATABASE_ID", "CLOUDFLARE_D1_DATABASE_ID");
  const token = requireEnv("CLOUDFLARE_API_TOKEN");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    const msg = data.errors?.[0]?.message ?? `D1 failed ${res.status}`;
    throw new Error(msg);
  }
  return data.result?.[0]?.results ?? [];
}

function parseArgs(argv) {
  let from = 22;
  let dryRun = false;
  let handoffRoot =
    process.env.EO_HANDOFF_ROOT ||
    "/workspace/empire-oddities-pipeline/handoff";
  let channelId = "ytch_empire_oddities";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") from = Number(argv[++i]);
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--handoff-root") handoffRoot = argv[++i];
    else if (a === "--channel-id") channelId = argv[++i];
  }
  return { from, dryRun, handoffRoot, channelId };
}

async function pickMp4(dir) {
  const files = await readdir(dir);
  const playable = files.filter((f) => /_playable\.mp4$/i.test(f));
  const allMp4 = files.filter((f) => /\.mp4$/i.test(f) && !/_playable\.mp4$/i.test(f));
  const candidates = [...playable, ...allMp4];
  for (const f of candidates) {
    const p = join(dir, f);
    const st = await stat(p);
    if (st.size > 0) return { path: p, size: st.size, name: f };
  }
  return null;
}

async function uploadToR2(localPath, key, size) {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const accessKeyId = requireEnv(
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
  );
  const secretAccessKey = requireEnv(
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
  );
  const bucket = requireEnv("CLOUDFLARE_R2_BUCKET", "R2_BUCKET_NAME");
  const accountId = env("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID");
  const endpoint =
    env("CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT") ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint: endpoint.replace(/\/$/, ""),
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: "video/mp4",
      ContentLength: size,
    }),
  );
  return { bucket, key, size };
}

async function main() {
  const { from, dryRun, handoffRoot, channelId } = parseArgs(process.argv.slice(2));
  console.log(`import-eo-handoffs: root=${handoffRoot} from=ep${String(from).padStart(3, "0")} dryRun=${dryRun} channel=${channelId}`);

  // Ensure channel exists
  const channels = await d1Query(
    "SELECT id, name FROM youtube_channels WHERE id = ? LIMIT 1",
    [channelId],
  );
  if (!channels[0]) {
    throw new Error(
      `Channel ${channelId} not found. Apply migrations/0002_youtube.sql first.`,
    );
  }
  console.log(`channel ok: ${channels[0].name}`);

  const entries = (await readdir(handoffRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^ep\d+$/i.test(d.name))
    .map((d) => d.name)
    .sort();

  const selected = entries.filter((name) => {
    const n = Number(name.replace(/^ep/i, ""));
    return Number.isFinite(n) && n >= from;
  });

  if (!selected.length) {
    console.log("No handoff episodes matched.");
    process.exit(0);
  }

  const report = [];
  for (const ep of selected) {
    const dir = join(handoffRoot, ep);
    const metaPath = join(dir, "metadata.json");
    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8"));
    } catch {
      console.warn(`SKIP ${ep}: missing metadata.json`);
      continue;
    }
    const mp4 = await pickMp4(dir);
    if (!mp4) {
      console.warn(`SKIP ${ep}: no playable/nonempty mp4`);
      continue;
    }

    // Idempotent: skip if episode already pending/published for this channel
    const existing = await d1Query(
      `SELECT id, status, r2_key FROM youtube_videos WHERE channel_id = ? AND episode = ? LIMIT 1`,
      [channelId, ep],
    );
    if (existing[0]?.r2_key) {
      console.log(`SKIP ${ep}: already imported (${existing[0].id} ${existing[0].status})`);
      report.push({ ep, status: "skipped_exists", videoId: existing[0].id });
      continue;
    }

    const videoId =
      existing[0]?.id ||
      `ytvid_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const key = `potencia-dashboard/youtube/${channelId}/${ep}/${basename(mp4.name)}`;

    console.log(
      `${dryRun ? "DRY " : ""}IMPORT ${ep}: ${mp4.name} (${(mp4.size / 1e6).toFixed(1)} MB) → ${key}`,
    );

    if (dryRun) {
      report.push({ ep, status: "dry_run", key, size: mp4.size, title: meta.title });
      continue;
    }

    const put = await uploadToR2(mp4.path, key, mp4.size);
    const now = Date.now();
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const privacy = meta.privacyStatus || "private";

    if (existing[0]) {
      await d1Query(
        `UPDATE youtube_videos SET title=?, description=?, tags_json=?, category_id=?, privacy_status=?,
         made_for_kids=?, r2_bucket=?, r2_key=?, r2_size_bytes=?, source_path=?, status='pending',
         metadata_json=?, updated_at=? WHERE id=?`,
        [
          meta.title || ep,
          meta.description || null,
          JSON.stringify(tags),
          String(meta.categoryId || "27"),
          privacy,
          meta.madeForKids ? 1 : 0,
          put.bucket,
          put.key,
          put.size,
          mp4.path,
          JSON.stringify(meta),
          now,
          videoId,
        ],
      );
    } else {
      await d1Query(
        `INSERT INTO youtube_videos (
          id, channel_id, title, description, tags_json, category_id, privacy_status,
          made_for_kids, r2_bucket, r2_key, r2_size_bytes, source_path, episode,
          status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          videoId,
          channelId,
          meta.title || ep,
          meta.description || null,
          JSON.stringify(tags),
          String(meta.categoryId || "27"),
          privacy,
          meta.madeForKids ? 1 : 0,
          put.bucket,
          put.key,
          put.size,
          mp4.path,
          ep,
          JSON.stringify(meta),
          now,
          now,
        ],
      );
    }

    report.push({
      ep,
      status: "imported",
      videoId,
      key: put.key,
      size: put.size,
      title: meta.title,
    });
    console.log(`OK ${ep} → ${videoId}`);
  }

  console.log(JSON.stringify({ ok: true, count: report.length, report }, null, 2));
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
