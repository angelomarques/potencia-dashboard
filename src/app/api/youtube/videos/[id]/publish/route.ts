import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { publishVideo } from "@/lib/youtube/publish";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const forceDryRun = body?.dryRun === true || body?.forceDryRun === true;
    const result = await publishVideo(id, { forceDryRun });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
