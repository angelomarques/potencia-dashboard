import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const res = await d1Query("SELECT * FROM youtube_videos WHERE id = ? LIMIT 1", [id]);
    if (!res.results[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const jobs = await d1Query(
      `SELECT id, status, dry_run, attempt, error, created_at, finished_at FROM youtube_upload_jobs WHERE video_id = ? ORDER BY created_at DESC LIMIT 20`,
      [id],
    );
    return NextResponse.json({ video: res.results[0], jobs: jobs.results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    await d1Query("DELETE FROM youtube_upload_jobs WHERE video_id = ?", [id]);
    await d1Query("DELETE FROM youtube_videos WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
