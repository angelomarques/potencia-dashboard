import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";
import { encryptSecret } from "@/lib/youtube/crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;

    const ch = await d1Query(
      `SELECT id, name, handle, youtube_channel_id, token_status, notes, created_at, updated_at,
              CASE WHEN refresh_token_enc IS NOT NULL AND length(refresh_token_enc) > 0 THEN 1 ELSE 0 END AS has_refresh_token
       FROM youtube_channels WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!ch.results[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const videos = await d1Query(
      `SELECT id, title, episode, status, privacy_status, r2_key, r2_size_bytes, youtube_video_id, publish_error, created_at, updated_at, published_at
       FROM youtube_videos WHERE channel_id = ? ORDER BY created_at DESC`,
      [id],
    );
    return NextResponse.json({ channel: ch.results[0], videos: videos.results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();

    const existing = await d1Query("SELECT id FROM youtube_channels WHERE id = ? LIMIT 1", [id]);
    if (!existing.results[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sets: string[] = [];
    const params: unknown[] = [];

    if (typeof body?.name === "string" && body.name.trim()) {
      sets.push("name = ?");
      params.push(body.name.trim());
    }
    if (typeof body?.handle === "string") {
      sets.push("handle = ?");
      params.push(body.handle.trim() || null);
    }
    if (typeof body?.youtubeChannelId === "string") {
      sets.push("youtube_channel_id = ?");
      params.push(body.youtubeChannelId.trim() || null);
    }
    if (typeof body?.notes === "string") {
      sets.push("notes = ?");
      params.push(body.notes.trim() || null);
    }
    if (typeof body?.refreshToken === "string") {
      const tok = body.refreshToken.trim();
      if (tok) {
        sets.push("refresh_token_enc = ?");
        params.push(encryptSecret(tok));
        sets.push("token_status = ?");
        params.push("ready");
      } else {
        sets.push("refresh_token_enc = NULL");
        sets.push("token_status = ?");
        params.push("missing");
      }
    }

    if (!sets.length) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(id);

    await d1Query(
      `UPDATE youtube_channels SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );

    const ch = await d1Query(
      `SELECT id, name, handle, youtube_channel_id, token_status, notes, created_at, updated_at FROM youtube_channels WHERE id = ?`,
      [id],
    );
    return NextResponse.json({ channel: ch.results[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
