import { env } from "@/env";
import { deliverDueOutbound } from "@/lib/daisy/outbound";
import { timingSafeEqualString } from "@/lib/daisy/pull";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = env.CRON_SECRET;
  const pullToken = env.DAISY_PULL_TOKEN;

  if (
    (!cronSecret || cronSecret.trim() === "") &&
    (!pullToken || pullToken.trim() === "")
  ) {
    return NextResponse.json(
      { error: "cron_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = match[1].trim();

  const isCronMatch =
    cronSecret && cronSecret.trim() !== ""
      ? timingSafeEqualString(token, cronSecret.trim())
      : false;
  const isPullMatch =
    pullToken && pullToken.trim() !== ""
      ? timingSafeEqualString(token, pullToken.trim())
      : false;

  if (!isCronMatch && !isPullMatch) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;
  const limit =
    !isNaN(parsedLimit) && parsedLimit > 0
      ? Math.min(100, Math.max(1, parsedLimit))
      : 50;

  const result = await deliverDueOutbound(limit);

  return NextResponse.json(
    {
      ok: true,
      attempted: result.attempted,
      delivered: result.delivered,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
