import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { daisyRateLimit } from "@/lib/daisy/ratelimit";
import { authenticateKanbanMcpRequest } from "@/lib/kanban/mcp/tokens";
import { createKanbanMcpServer } from "@/lib/kanban/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kanban MCP endpoint (Streamable HTTP, stateless, JSON responses).
 * Auth: `Authorization: Bearer <per-user token>` stored hashed in D1 (`kanban_mcp_tokens`).
 */
async function handle(req: Request): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  const rl = await daisyRateLimit(`kanban:${ip}`, "inbound");
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {},
      },
    );
  }

  const auth = await authenticateKanbanMcpRequest(
    req.headers.get("authorization"),
  );
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.code }, id: null },
      {
        status: auth.status,
        headers: {
          "WWW-Authenticate": 'Bearer realm="kanban-mcp"',
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (req.method === "GET" || req.method === "DELETE") {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
      },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const server = createKanbanMcpServer(auth.actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
