import { RPCHandler } from "@orpc/server/fetch";
import { appRouter } from "@/lib/daisy/orpc/router";

const handler = new RPCHandler(appRouter);

async function handle(request: Request) {
  const { matched, response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { headers: request.headers },
  });

  if (matched) {
    return response;
  }

  return new Response("Not found", { status: 404 });
}

export async function GET(
  request: Request,
  _context: { params: Promise<{ rest?: string[] }> }
) {
  return handle(request);
}

export async function POST(
  request: Request,
  _context: { params: Promise<{ rest?: string[] }> }
) {
  return handle(request);
}

export async function PUT(
  request: Request,
  _context: { params: Promise<{ rest?: string[] }> }
) {
  return handle(request);
}

export async function PATCH(
  request: Request,
  _context: { params: Promise<{ rest?: string[] }> }
) {
  return handle(request);
}

export async function DELETE(
  request: Request,
  _context: { params: Promise<{ rest?: string[] }> }
) {
  return handle(request);
}
