import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";
import { putR2Object, youtubeMediaKey } from "@/lib/r2/client";
import { r2Configured } from "@/lib/r2/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Multipart upload: fields channelId, title?, privacyStatus?, episode?, file (video).
 * Stores to R2 and creates a pending youtube_videos row.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!r2Configured()) {
      return NextResponse.json(
        { error: "R2 is not configured (CLOUDFLARE_R2_* / R2_* env)" },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const channelId = String(form.get("channelId") || "");
    const title = String(form.get("title") || "").trim();
    const privacyStatus = String(form.get("privacyStatus") || "private");
    const episode = String(form.get("episode") || "").trim() || null;
    const description = String(form.get("description") || "") || null;
    const file = form.get("file");

    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const ch = await d1Query("SELECT id FROM youtube_channels WHERE id = ? LIMIT 1", [
      channelId,
    ]);
    if (!ch.results[0]) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const videoId = `ytvid_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const filename = file.name || "video.mp4";
    const key = youtubeMediaKey({
      channelId,
      videoId,
      filename,
    });
    const buf = Buffer.from(await file.arrayBuffer());
    const put = await putR2Object({
      key,
      body: buf,
      contentType: file.type || "video/mp4",
      contentLength: buf.length,
    });

    const now = Date.now();
    const finalTitle = title || filename.replace(/\.[^.]+$/, "");
    const privacy = ["private", "unlisted", "public"].includes(privacyStatus)
      ? privacyStatus
      : "private";

    await d1Query(
      `INSERT INTO youtube_videos (
        id, channel_id, title, description, tags_json, category_id, privacy_status,
        made_for_kids, r2_bucket, r2_key, r2_size_bytes, episode, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        videoId,
        channelId,
        finalTitle,
        description,
        "[]",
        "22",
        privacy,
        put.bucket,
        put.key,
        buf.length,
        episode,
        now,
        now,
      ],
    );

    return NextResponse.json({
      video: {
        id: videoId,
        channel_id: channelId,
        title: finalTitle,
        r2_bucket: put.bucket,
        r2_key: put.key,
        r2_size_bytes: buf.length,
        status: "pending",
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
