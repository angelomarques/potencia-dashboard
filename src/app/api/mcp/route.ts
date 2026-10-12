import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { env } from "@/env";
import { daisyRateLimit } from "@/lib/daisy/ratelimit";
import { verifyMcpAuth } from "@/lib/daisy/mcp/auth";
import { createDaisyMcpServer } from "@/lib/daisy/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daisy Studio MCP endpoint (Streamable HTTP, stateless, JSON responses).
 * Auth: `Authorization: Bearer <per-agent token>` from DAISY_MCP_TOKENS.
 */
async function handle(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
  const rl = await daisyRateLimit(ip, "inbound");
  if (!rl.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} });
  }
  const auth = verifyMcpAuth(req.headers.get("authorization"), env.DAISY_MCP_TOKENS);
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.code }, id: null },
      { status: auth.status, headers: { "WWW-Authenticate": 'Bearer realm="daisy-mcp"', "Cache-Control": "no-store" } }
    );
  }
  if (req.method === "GET" || req.method === "DELETE") {
    // Stateless server: no standalone SSE stream / sessions.
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, { status: 405, headers: { Allow: "POST" } });
  }
  const server = createDaisyMcpServer(auth.agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // JSON response mode: body is fully built before handleRequest resolves.
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
