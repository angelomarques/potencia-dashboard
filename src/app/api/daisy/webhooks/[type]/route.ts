import { handleInboundRequest } from "@/lib/daisy/inbound";
import { DaisySketchConflictError, type InboundEventType } from "@/lib/daisy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_MAP: Record<string, InboundEventType> = {
  project: "project.upserted",
  message: "message.created",
  sketch: "sketch.created",
  "sketch-updated": "sketch.updated",
  "sketch.updated": "sketch.updated",
  "sketch_updated": "sketch.updated",
  "section-ready": "section.ready",
  preview: "preview.updated",
};

export async function POST(
  req: Request,
  props: { params: Promise<{ type: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const expectedType = TYPE_MAP[params.type];
    if (!expectedType) {
      return Response.json({ error: "unknown_webhook_type" }, { status: 404 });
    }

    return await handleInboundRequest(req, { expectedType });
  } catch (err: unknown) {
    if (
      err instanceof DaisySketchConflictError ||
      (err as { name?: string })?.name === "DaisySketchConflictError" ||
      /sketch_conflict/i.test(String(err)) ||
      /UNIQUE constraint failed/i.test(String(err))
    ) {
      return Response.json({ error: "sketch_conflict" }, { status: 409 });
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
