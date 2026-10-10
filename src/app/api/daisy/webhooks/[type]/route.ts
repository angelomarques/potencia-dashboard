import { handleInboundRequest } from "@/lib/daisy/inbound";
import type { InboundEventType } from "@/lib/daisy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, InboundEventType> = {
  project: "project.upserted",
  message: "message.created",
  sketch: "sketch.created",
  "section-ready": "section.ready",
  preview: "preview.updated",
};

export async function POST(
  req: Request,
  props: { params: Promise<{ type: string }> }
): Promise<Response> {
  const params = await props.params;
  const expectedType = TYPE_MAP[params.type];
  if (!expectedType) {
    return Response.json({ error: "unknown_webhook_type" }, { status: 404 });
  }

  return handleInboundRequest(req, { expectedType });
}
