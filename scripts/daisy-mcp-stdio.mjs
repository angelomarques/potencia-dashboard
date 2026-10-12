#!/usr/bin/env node
/**
 * Daisy Studio MCP — tiny stdio fallback / proxy.
 *
 * Forwards every tool to the remote endpoint (DAISY_MCP_URL, default
 * https://dashboard.potenciaapps.com.br/api/mcp) with DAISY_MCP_TOKEN, and adds
 * one local convenience: push_sketch accepts `filePath` (a local image), which is
 * read here and sent as imageBase64 — so the model never has to emit base64.
 *
 *   DAISY_MCP_TOKEN=... node scripts/daisy-mcp-stdio.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.DAISY_MCP_URL || "https://dashboard.potenciaapps.com.br/api/mcp";
const token = process.env.DAISY_MCP_TOKEN;
if (!token) {
  console.error("DAISY_MCP_TOKEN is required");
  process.exit(1);
}
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

const remote = new Client({ name: "daisy-mcp-stdio", version: "1.0.0" });
await remote.connect(
  new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })
);

const server = new Server({ name: "daisy-studio", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools } = await remote.listTools();
  return {
    tools: tools.map((t) =>
      t.name !== "push_sketch"
        ? t
        : {
            ...t,
            description: `${t.description} Local proxy: you may pass filePath (absolute path to a local image) instead.`,
            inputSchema: {
              ...t.inputSchema,
              properties: { ...t.inputSchema.properties, filePath: { type: "string", description: "Local image file to upload" } },
            },
          }
    ),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = { ...(req.params.arguments ?? {}) };
  if (req.params.name === "push_sketch" && typeof args.filePath === "string") {
    const file = path.resolve(String(args.filePath));
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) return { isError: true, content: [{ type: "text", text: `unsupported file type: ${file}` }] };
    args.imageBase64 = (await readFile(file)).toString("base64");
    args.contentType = mime;
    args.filename ??= path.basename(file);
    delete args.filePath;
  }
  return remote.callTool({ name: req.params.name, arguments: args });
});

await server.connect(new StdioServerTransport());
