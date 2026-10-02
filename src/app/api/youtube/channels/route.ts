import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";
import { encryptSecret } from "@/lib/youtube/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const res = await d1Query<Record<string, unknown>>(
      `SELECT id, name, handle, youtube_channel_id, token_status, notes, created_at, updated_at,
              CASE WHEN refresh_token_enc IS NOT NULL AND length(refresh_token_enc) > 0 THEN 1 ELSE 0 END AS has_refresh_token
       FROM youtube_channels
       ORDER BY created_at ASC`,
    );
    return NextResponse.json({ channels: res.results });
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const handle =
      typeof body?.handle === "string" ? body.handle.trim() || null : null;
    const youtubeChannelId =
      typeof body?.youtubeChannelId === "string"
        ? body.youtubeChannelId.trim() || null
        : null;
    const notes =
      typeof body?.notes === "string" ? body.notes.trim() || null : null;
    const refreshToken =
      typeof body?.refreshToken === "string" ? body.refreshToken.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const id = `ytch_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = Date.now();
    let refreshEnc: string | null = null;
    let tokenStatus = "missing";
    if (refreshToken) {
      refreshEnc = encryptSecret(refreshToken);
      tokenStatus = "ready";
    }

    await d1Query(
      `INSERT INTO youtube_channels (
        id, name, handle, youtube_channel_id, refresh_token_enc, token_status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, handle, youtubeChannelId, refreshEnc, tokenStatus, notes, now, now],
    );

    const created = await d1Query(
      `SELECT id, name, handle, youtube_channel_id, token_status, notes, created_at, updated_at FROM youtube_channels WHERE id = ?`,
      [id],
    );
    return NextResponse.json({ channel: created.results[0] }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
