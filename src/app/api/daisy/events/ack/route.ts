import { env } from "@/env";
import { daisyRateLimit } from "@/lib/daisy/ratelimit";
import { ackEvents, verifyPullAuth } from "@/lib/daisy/pull";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  // Rate limit pull/ack requests
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

  const body = (await req.json().catch(() => null)) as { upTo?: unknown } | null;

  if (
    !body ||
    typeof body.upTo !== "number" ||
    isNaN(body.upTo) ||
    body.upTo < 0
  ) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Request body must include numeric upTo >= 0",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await ackEvents(body.upTo);

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
