#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

function env(name, ...alts) {
  for (const n of [name, ...alts]) {
    const v = process.env[n]?.trim();
    if (v && v !== "[SENSITIVE]") return v;
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
    throw new Error(data.errors?.[0]?.message ?? `D1 ${res.status}`);
  }
  return data.result?.[0]?.results ?? [];
}

function parseArgs(argv) {
  let artifacts = "artifacts/prove";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--artifacts") artifacts = argv[++i];
  }
  return { artifacts };
}

function wrangler(args) {
  return spawnSync("pnpm", ["exec", "wrangler", ...args], {
    encoding: "utf8",
    env: process.env,
  });
}

function createR2Adapter({ bucket, accessKeyId, secretAccessKey, accountId }) {
  const useS3 = Boolean(accessKeyId && secretAccessKey);
  if (!useS3) {
    return {
      mode: "wrangler",
      async put({ key, file, bytes }) {
        const put = wrangler([
          "r2",
          "object",
          "put",
          `${bucket}/${key}`,
          "--file",
          file,
          "--remote",
          "--content-type",
          "video/mp4",
        ]);
        if (put.status !== 0) {
          throw new Error(
            `wrangler r2 put failed: ${put.stderr || put.stdout || put.status}`,
          );
        }
        return { bytes };
      },
      async head(key) {
        const dest = join(tmpdir(), `r2-head-${randomUUID()}`);
        const got = wrangler([
          "r2",
          "object",
          "get",
          `${bucket}/${key}`,
          "--remote",
          "--file",
          dest,
        ]);
        if (got.status !== 0) {
          const msg = `${got.stderr || ""} ${got.stdout || ""}`;
          if (/does not exist|NotFound|404/i.test(msg)) {
            return { exists: false };
          }
          throw new Error(`wrangler r2 get failed: ${msg}`);
        }
        const size = statSync(dest).size;
        try {
          unlinkSync(dest);
        } catch {
          // ignore temp cleanup
        }
        return { exists: true, size };
      },
      async previewRange() {
        return { skipped: true, reason: "wrangler fallback has no signed GET" };
      },
      async remove(key) {
        const del = wrangler([
          "r2",
          "object",
          "delete",
          `${bucket}/${key}`,
          "--remote",
          "--force",
        ]);
        if (del.status !== 0) {
          throw new Error(
            `wrangler r2 delete failed: ${del.stderr || del.stdout || del.status}`,
          );
        }
      },
    };
  }

  const {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const endpoint =
    env("CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT") ||
    `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint: endpoint.replace(/\/$/, ""),
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    mode: "s3",
    async put({ key, body, bytes }) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "video/mp4",
          ContentLength: bytes,
        }),
      );
      return { bytes };
    },
    async head(key) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return { exists: true, size: head.ContentLength };
      } catch (err) {
        const name = err?.name;
        const code = err?.$metadata?.httpStatusCode;
        if (name === "NotFound" || code === 404) {
          return { exists: false };
        }
        throw err;
      }
    },
    async previewRange(key) {
      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: "video/mp4",
        }),
        { expiresIn: 600 },
      );
      const previewRes = await fetch(signedUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1023" },
      });
      if (!(previewRes.status === 200 || previewRes.status === 206)) {
        throw new Error(`Signed preview GET failed: HTTP ${previewRes.status}`);
      }
      const previewBytes = Buffer.from(await previewRes.arrayBuffer());
      if (previewBytes.length <= 0) {
        throw new Error("Signed preview returned empty body");
      }
      return {
        httpStatus: previewRes.status,
        bytes: previewBytes.length,
        expiresIn: 600,
      };
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

async function main() {
  const { artifacts } = parseArgs(process.argv.slice(2));
  await mkdir(artifacts, { recursive: true });
  const report = { steps: [], ok: false };

  // 1) tables
  const tables = await d1Query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('youtube_channels','youtube_videos','youtube_upload_jobs')",
  );
  const names = new Set(tables.map((t) => t.name));
  if (
    !names.has("youtube_channels") ||
    !names.has("youtube_videos") ||
    !names.has("youtube_upload_jobs")
  ) {
    throw new Error("YouTube tables missing — run scripts/apply-youtube-migration.mjs");
  }
  report.steps.push({ step: "schema", pass: true });

  const channels = await d1Query(
    "SELECT id FROM youtube_channels WHERE id = 'ytch_empire_oddities' LIMIT 1",
  );
  if (!channels[0]) {
    throw new Error("Seed channel ytch_empire_oddities missing");
  }
  report.steps.push({ step: "seed_channel", pass: true });

  // 2) tiny fixture via ffmpeg if available, else minimal bytes labeled mp4
  const fixture = join(artifacts, "prove-fixture.mp4");
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x240:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      "1",
      fixture,
    ],
    { encoding: "utf8" },
  );
  if (ff.status !== 0) {
    await writeFile(fixture, Buffer.alloc(2048, 1));
    report.steps.push({
      step: "fixture",
      pass: true,
      note: "ffmpeg missing; used opaque 2KB blob",
    });
  } else {
    report.steps.push({ step: "fixture", pass: true, note: "ffmpeg 1s mp4" });
  }
  const body = await readFile(fixture);

  let bucket = env("CLOUDFLARE_R2_BUCKET", "R2_BUCKET_NAME");
  if (!bucket) {
    const existing = await d1Query(
      "SELECT r2_bucket FROM youtube_videos WHERE r2_bucket IS NOT NULL LIMIT 1",
    );
    bucket = existing[0]?.r2_bucket;
  }
  if (!bucket) {
    throw new Error("Missing R2 bucket (CLOUDFLARE_R2_BUCKET / D1 r2_bucket)");
  }

  const r2 = createR2Adapter({
    bucket,
    accessKeyId: env("CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
    secretAccessKey: env(
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "R2_SECRET_ACCESS_KEY",
    ),
    accountId: env("CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID"),
  });
  report.steps.push({ step: "r2_mode", pass: true, mode: r2.mode, bucket });

  const videoId = `ytvid_prove_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const key = `potencia-dashboard/youtube/ytch_empire_oddities/_prove/${videoId}.mp4`;
  await r2.put({ key, file: fixture, body, bytes: body.length });
  report.steps.push({ step: "r2_put", pass: true, key, bytes: body.length });

  const head = await r2.head(key);
  if (!head.exists || !head.size || head.size <= 0) {
    throw new Error("R2 HeadObject size not > 0");
  }
  report.steps.push({
    step: "r2_head",
    pass: true,
    size: head.size,
  });

  const now = Date.now();
  await d1Query(
    `INSERT INTO youtube_videos (
      id, channel_id, title, description, tags_json, category_id, privacy_status,
      made_for_kids, r2_bucket, r2_key, r2_size_bytes, episode, status, metadata_json,
      created_at, updated_at
    ) VALUES (?, 'ytch_empire_oddities', ?, ?, '[]', '27', 'private', 0, ?, ?, ?, '_prove', 'pending', ?, ?, ?)`,
    [
      videoId,
      `Prove fixture ${videoId}`,
      "Automated prove — safe to delete",
      bucket,
      key,
      body.length,
      JSON.stringify({ prove: true, videoId }),
      now,
      now,
    ],
  );
  report.steps.push({ step: "d1_insert", pass: true, videoId });

  const rows = await d1Query(
    "SELECT id, r2_key, r2_size_bytes, status, title FROM youtube_videos WHERE id = ?",
    [videoId],
  );
  if (!rows[0] || rows[0].r2_key !== key || rows[0].status !== "pending") {
    throw new Error("D1 metadata mismatch after insert");
  }
  report.steps.push({ step: "d1_readback", pass: true, row: rows[0] });

  // Dry-run job record (no YouTube OAuth required)
  const jobId = `ytjob_prove_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await d1Query(
    `INSERT INTO youtube_upload_jobs (
      id, video_id, status, attempt, dry_run, request_json, result_json, created_at, updated_at, finished_at
    ) VALUES (?, ?, 'dry_run', 1, 1, ?, ?, ?, ?, ?)`,
    [
      jobId,
      videoId,
      JSON.stringify({
        snippet: { title: rows[0].title },
        media: { r2_bucket: bucket, r2_key: key },
      }),
      JSON.stringify({ ok: true, dry_run: true, reason: "prove" }),
      now,
      now,
      now,
    ],
  );
  report.steps.push({ step: "dry_run_job", pass: true, jobId });

  const preview = await r2.previewRange(key);
  if (preview.skipped) {
    report.steps.push({
      step: "r2_signed_preview",
      pass: true,
      skipped: true,
      note: preview.reason,
    });
  } else {
    report.steps.push({
      step: "r2_signed_preview",
      pass: true,
      httpStatus: preview.httpStatus,
      bytes: preview.bytes,
      expiresIn: preview.expiresIn,
    });
  }

  // Optional EO episode check
  const eoEp = process.env.PROVE_EO_EPISODE?.trim();
  if (eoEp) {
    const eo = await d1Query(
      `SELECT id, r2_key, r2_size_bytes, status FROM youtube_videos WHERE channel_id='ytch_empire_oddities' AND episode=? LIMIT 1`,
      [eoEp],
    );
    if (!eo[0]?.r2_key) throw new Error(`EO ${eoEp} not in D1 pending queue`);
    const eoHead = await r2.head(eo[0].r2_key);
    if (!eoHead.exists || !eoHead.size || eoHead.size <= 0) {
      throw new Error(`EO ${eoEp} R2 object missing/empty`);
    }
    report.steps.push({
      step: "eo_episode",
      pass: true,
      episode: eoEp,
      key: eo[0].r2_key,
      size: eoHead.size,
    });
  }

  // Product delete order: R2 object first, then D1 jobs + video row.
  await r2.remove(key);
  const after = await r2.head(key);
  if (after.exists) {
    throw new Error("R2 object still exists after delete");
  }
  report.steps.push({ step: "r2_delete", pass: true, key });

  await d1Query("DELETE FROM youtube_upload_jobs WHERE video_id = ?", [videoId]);
  await d1Query("DELETE FROM youtube_videos WHERE id = ?", [videoId]);
  const leftoverVideo = await d1Query(
    "SELECT id FROM youtube_videos WHERE id = ?",
    [videoId],
  );
  const leftoverJobs = await d1Query(
    "SELECT id FROM youtube_upload_jobs WHERE video_id = ?",
    [videoId],
  );
  if (leftoverVideo[0]) {
    throw new Error("D1 youtube_videos row still present after delete");
  }
  if (leftoverJobs[0]) {
    throw new Error("D1 youtube_upload_jobs rows still present after delete");
  }
  report.steps.push({ step: "d1_delete", pass: true, videoId });

  report.ok = true;
  report.artifact = {
    fixture,
    key,
    videoId,
    jobId,
    bucket,
    deleted: true,
    r2Mode: r2.mode,
  };
  await writeFile(join(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`PASS prove-youtube-manager artifacts=${artifacts}`);
}

main().catch(async (err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
