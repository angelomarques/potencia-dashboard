import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { d1Query } from "@/lib/db/d1-http";
import { presignR2GetUrl } from "@/lib/r2/client";
import { r2Configured } from "@/lib/r2/config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Auth-gated preview: returns a short-lived signed R2 GET URL for <video controls>.
 * Bucket stays private; URL expires in ~10 minutes.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!r2Configured()) {
      return NextResponse.json(
        { error: "R2 is not configured (CLOUDFLARE_R2_* / R2_* env)" },
        { status: 503 },
      );
    }

    const { id } = await ctx.params;
    const res = await d1Query(
      "SELECT id, r2_key, r2_bucket, title, status FROM youtube_videos WHERE id = ? LIMIT 1",
      [id],
    );
    const row = res.results[0] as
      | {
          id: string;
          r2_key: string | null;
          r2_bucket: string | null;
          title: string;
          status: string;
        }
      | undefined;

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!row.r2_key) {
      return NextResponse.json(
        { error: "Video has no R2 object yet" },
        { status: 404 },
      );
    }

    const signed = await presignR2GetUrl({
      key: row.r2_key,
      bucket: row.r2_bucket ?? undefined,
      expiresInSeconds: 600,
      responseContentType: "video/mp4",
    });

    return NextResponse.json({
      videoId: row.id,
      title: row.title,
      r2_key: row.r2_key,
      url: signed.url,
      expiresIn: signed.expiresIn,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
