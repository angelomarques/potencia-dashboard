import { env } from "@/env";
import { daisyRateLimit } from "@/lib/daisy/ratelimit";
import { pullEvents, verifyPullAuth } from "@/lib/daisy/pull";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  // Rate limit pull requests
  const rl = await daisyRateLimit(ip, "pull");
  if (!rl.ok) {
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
    };
    if (rl.retryAfter) {
      headers["Retry-After"] = String(rl.retryAfter);
    }
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers }
    );
  }

  // Constant-time Bearer token authentication
  const auth = verifyPullAuth(
    req.headers.get("authorization"),
    env.DAISY_PULL_TOKEN
  );
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.code },
      { status: auth.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const url = new URL(req.url);
  const afterParam = url.searchParams.get("after");
  const limitParam = url.searchParams.get("limit");

  const parsedAfter = afterParam ? parseInt(afterParam, 10) : 0;
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;

  const after = !isNaN(parsedAfter) && parsedAfter >= 0 ? parsedAfter : 0;
  const limit = !isNaN(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : 50;

  const result = await pullEvents({ after, limit });

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
