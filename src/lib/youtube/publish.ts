import "server-only";
import { d1Query } from "@/lib/db/d1-http";
import { decryptSecret } from "./crypto";
import { getR2ObjectBuffer } from "@/lib/r2/client";

export type PublishMode = "dry_run" | "live";

export type PublishResult = {
  mode: PublishMode;
  jobId: string;
  videoId: string;
  youtubeVideoId?: string;
  message: string;
  requestPreview?: Record<string, unknown>;
};

type ChannelRow = {
  id: string;
  name: string;
  handle: string | null;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_token_expires_at: number | null;
  token_status: string;
};

type VideoRow = {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  tags_json: string | null;
  category_id: string | null;
  privacy_status: string;
  made_for_kids: number;
  r2_bucket: string | null;
  r2_key: string | null;
  r2_size_bytes: number | null;
  status: string;
};

function oauthConfigured(): boolean {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID?.trim() &&
      process.env.YOUTUBE_CLIENT_SECRET?.trim(),
  );
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.YOUTUBE_CLIENT_ID!.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!.trim();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

/**
 * Publish a queued video. Defaults to dry_run when OAuth or channel tokens missing.
 * Live path uses resumable upload to YouTube Data API v3 (videos.insert).
 */
export async function publishVideo(
  videoId: string,
  opts: { forceDryRun?: boolean } = {},
): Promise<PublishResult> {
  const now = Date.now();
  const videoRes = await d1Query<VideoRow>(
    "SELECT * FROM youtube_videos WHERE id = ? LIMIT 1",
    [videoId],
  );
  const video = videoRes.results[0];
  if (!video) throw new Error("Video not found");

  const chRes = await d1Query<ChannelRow>(
    "SELECT * FROM youtube_channels WHERE id = ? LIMIT 1",
    [video.channel_id],
  );
  const channel = chRes.results[0];
  if (!channel) throw new Error("Channel not found");

  if (!video.r2_key || !video.r2_bucket) {
    throw new Error("Video has no R2 media (r2_key/r2_bucket required)");
  }

  const tags = video.tags_json ? (JSON.parse(video.tags_json) as string[]) : [];
  const requestPreview = {
    snippet: {
      title: video.title,
      description: video.description ?? "",
      tags,
      categoryId: video.category_id ?? "22",
    },
    status: {
      privacyStatus: video.privacy_status || "private",
      selfDeclaredMadeForKids: Boolean(video.made_for_kids),
    },
    media: {
      r2_bucket: video.r2_bucket,
      r2_key: video.r2_key,
      r2_size_bytes: video.r2_size_bytes,
    },
    channel: { id: channel.id, name: channel.name, handle: channel.handle },
  };

  const canLive =
    !opts.forceDryRun &&
    oauthConfigured() &&
    channel.token_status === "ready" &&
    Boolean(channel.refresh_token_enc);

  const jobId = `ytjob_${crypto.randomUUID()}`;
  const mode: PublishMode = canLive ? "live" : "dry_run";

  await d1Query(
    `INSERT INTO youtube_upload_jobs (
      id, video_id, status, attempt, dry_run, request_json, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      jobId,
      videoId,
      mode === "dry_run" ? "dry_run" : "running",
      mode === "dry_run" ? 1 : 0,
      JSON.stringify(requestPreview),
      now,
      now,
    ],
  );

  if (mode === "dry_run") {
    const reason = !oauthConfigured()
      ? "YOUTUBE_CLIENT_ID/SECRET not set"
      : channel.token_status !== "ready" || !channel.refresh_token_enc
        ? "channel OAuth tokens missing (token_status != ready)"
        : "forceDryRun";
    await d1Query(
      `UPDATE youtube_upload_jobs SET status = 'dry_run', result_json = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
      [
        JSON.stringify({ ok: true, dry_run: true, reason }),
        Date.now(),
        Date.now(),
        jobId,
      ],
    );
    return {
      mode: "dry_run",
      jobId,
      videoId,
      message: `Dry-run only — ${reason}. R2 media + metadata verified; no YouTube API call.`,
      requestPreview,
    };
  }

  // Live upload
  try {
    const refresh = decryptSecret(channel.refresh_token_enc!);
    const token = await refreshAccessToken(refresh);
    const body = await getR2ObjectBuffer(video.r2_key, video.r2_bucket);

    // Resumable upload init
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(body.length),
        },
        body: JSON.stringify({
          snippet: requestPreview.snippet,
          status: requestPreview.status,
        }),
      },
    );
    if (!initRes.ok) {
      const t = await initRes.text();
      throw new Error(`YouTube resumable init failed (${initRes.status}): ${t.slice(0, 300)}`);
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube resumable init missing Location header");

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(body.length),
      },
      body: body as unknown as BodyInit,
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(`YouTube upload failed (${putRes.status}): ${t.slice(0, 300)}`);
    }
    const uploaded = (await putRes.json()) as { id?: string };
    const ytId = uploaded.id;
    if (!ytId) throw new Error("YouTube upload response missing video id");

    const finished = Date.now();
    await d1Query(
      `UPDATE youtube_videos SET status = 'published', youtube_video_id = ?, publish_error = NULL, published_at = ?, updated_at = ? WHERE id = ?`,
      [ytId, finished, finished, videoId],
    );
    await d1Query(
      `UPDATE youtube_upload_jobs SET status = 'succeeded', result_json = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify({ youtube_video_id: ytId }), finished, finished, jobId],
    );

    return {
      mode: "live",
      jobId,
      videoId,
      youtubeVideoId: ytId,
      message: `Published to YouTube as ${ytId}`,
      requestPreview,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const finished = Date.now();
    await d1Query(
      `UPDATE youtube_videos SET status = 'failed', publish_error = ?, updated_at = ? WHERE id = ?`,
      [message.slice(0, 1000), finished, videoId],
    );
    await d1Query(
      `UPDATE youtube_upload_jobs SET status = 'failed', error = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
      [message.slice(0, 1000), finished, finished, jobId],
    );
    throw err;
  }
}
