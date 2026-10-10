import { handleInboundRequest } from "@/lib/daisy/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  return handleInboundRequest(req);
}
