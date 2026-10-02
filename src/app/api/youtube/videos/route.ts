import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const channelId = request.nextUrl.searchParams.get("channelId");
    const status = request.nextUrl.searchParams.get("status");

    let sql = `SELECT id, channel_id, title, episode, status, privacy_status, r2_key, r2_size_bytes, youtube_video_id, created_at, updated_at
               FROM youtube_videos WHERE 1=1`;
    const params: unknown[] = [];
    if (channelId) {
      sql += " AND channel_id = ?";
      params.push(channelId);
    }
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC LIMIT 200";

    const res = await d1Query(sql, params);
    return NextResponse.json({ videos: res.results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const channelId = typeof body?.channelId === "string" ? body.channelId : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!channelId || !title) {
      return NextResponse.json(
        { error: "channelId and title are required" },
        { status: 400 },
      );
    }

    const ch = await d1Query("SELECT id FROM youtube_channels WHERE id = ? LIMIT 1", [
      channelId,
    ]);
    if (!ch.results[0]) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const id = `ytvid_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = Date.now();
    const privacy =
      typeof body?.privacyStatus === "string" &&
      ["private", "unlisted", "public"].includes(body.privacyStatus)
        ? body.privacyStatus
        : "private";
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const description =
      typeof body?.description === "string" ? body.description : null;
    const episode = typeof body?.episode === "string" ? body.episode : null;
    const r2Bucket = typeof body?.r2Bucket === "string" ? body.r2Bucket : null;
    const r2Key = typeof body?.r2Key === "string" ? body.r2Key : null;
    const r2Size =
      typeof body?.r2SizeBytes === "number" ? body.r2SizeBytes : null;
    const sourcePath =
      typeof body?.sourcePath === "string" ? body.sourcePath : null;
    const status =
      r2Key && r2Bucket ? "pending" : "draft";
    const metadataJson =
      body?.metadata != null ? JSON.stringify(body.metadata) : null;
    const categoryId =
      typeof body?.categoryId === "string" ? body.categoryId : "22";
    const madeForKids = body?.madeForKids === true ? 1 : 0;

    await d1Query(
      `INSERT INTO youtube_videos (
        id, channel_id, title, description, tags_json, category_id, privacy_status,
        made_for_kids, r2_bucket, r2_key, r2_size_bytes, source_path, episode,
        status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        channelId,
        title,
        description,
        JSON.stringify(tags),
        categoryId,
        privacy,
        madeForKids,
        r2Bucket,
        r2Key,
        r2Size,
        sourcePath,
        episode,
        status,
        metadataJson,
        now,
        now,
      ],
    );

    const created = await d1Query("SELECT * FROM youtube_videos WHERE id = ?", [id]);
    return NextResponse.json({ video: created.results[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
