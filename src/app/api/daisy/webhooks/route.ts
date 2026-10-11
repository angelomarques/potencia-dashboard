import { handleInboundRequest } from "@/lib/daisy/inbound";
import { DaisySketchConflictError } from "@/lib/daisy/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    return await handleInboundRequest(req);
  } catch (err: unknown) {
    if (
      err instanceof DaisySketchConflictError ||
      (err as { name?: string })?.name === "DaisySketchConflictError"
    ) {
      return NextResponse.json({ error: "sketch_conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
