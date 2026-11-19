// Captures a real MCP transcript against a LOCAL dev server (local D1 mock + local migrations).
// Usage: BASE=http://localhost:43213 node docs/pr-evidence/leads-mcp/capture-transcript.mjs
// The bearer token is minted through the signed-in /api/kanban/mcp/tokens route and redacted in the output.
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:43213";
const OUT = process.env.OUT || "docs/pr-evidence/leads-mcp/mcp-transcript.json";
const stamp = Date.now().toString(36);

const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: `leads-mcp-${stamp}@example.com`, password: `local-evidence-${stamp}`, name: "Leads MCP Evidence" }),
});
if (!su.ok) throw new Error(`sign-up failed: ${su.status}`);
const cookie = (su.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

const mint = await fetch(`${BASE}/api/kanban/mcp/tokens`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie, origin: BASE },
  body: JSON.stringify({ name: "Leads MCP evidence" }),
});
const minted = await mint.json();
if (!mint.ok || !minted.token) throw new Error(`token mint failed: ${mint.status}`);
const TOKEN = minted.token;
const redact = (v) => JSON.parse(JSON.stringify(v).split(TOKEN).join("<REDACTED_TOKEN>"));

const transcript = {
  capturedAt: new Date().toISOString(),
  server: `${BASE}/api/leads/mcp`,
  note: "Local dev server, local node:sqlite D1 HTTP mock with migrations 0001, 0002_add_todo_column, 0005, 0006 applied. Token minted locally via /api/kanban/mcp/tokens; value redacted.",
  token: { id: minted.record?.id, prefix: "<REDACTED>", name: minted.record?.name },
  exchanges: [],
};

let id = 0;
async function rpc(label, method, params, { auth = true, path = "/api/leads/mcp", notification = false } = {}) {
  const body = notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params };
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
  if (auth) headers.authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  transcript.exchanges.push(redact({ label, endpoint: path, status: res.status, request: { headers: { ...headers, authorization: auth ? "Bearer <REDACTED_TOKEN>" : undefined }, body }, response: json }));
  return json;
}
const call = (label, name, args, opts) => rpc(label, "tools/call", { name, arguments: args }, opts);
const sc = (r) => r?.result?.structuredContent;

await rpc("unauthenticated request is rejected", "tools/list", {}, { auth: false });
await rpc("initialize", "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "leads-mcp-evidence", version: "1.0.0" } });
await rpc("notifications/initialized", "notifications/initialized", {}, { notification: true });
const tools = await rpc("tools/list", "tools/list", {});
const slug = `manareal-${stamp}`;
await call("create_project", "create_project", { name: `Manareal ${stamp}`, slug, tagline: "Manareal outbound (local evidence)" });
await call("create_project duplicate slug", "create_project", { name: "Dup", slug });
await call("create_project bad slug", "create_project", { name: "Bad", slug: "Bad Slug!" });
const created = await call("create_lead", "create_lead", {
  projectSlug: slug, name: "Maria Souza", role: "Owner", email: "maria@example.com", company: "Souza Imóveis",
  website: "https://souza.example.com", source: "quicksilver", notes: "Local evidence lead", nextFollowUpAt: "2026-11-25T13:00:00.000Z",
});
await call("create_lead duplicate email (return_existing, default)", "create_lead", { projectSlug: slug, name: "Maria S.", email: "  MARIA@example.com " });
await call("create_lead duplicate email (onDuplicate=error)", "create_lead", { projectSlug: slug, name: "Maria S.", email: "maria@example.com", onDuplicate: "error" });
await call("find_lead_by_email", "find_lead_by_email", { email: "maria@example.com", projectSlug: slug });
const leadId = sc(created)?.lead?.id;
await call("log_approach (sent -> contacted)", "log_approach", { leadId, channel: "email", direction: "outbound", outcome: "sent", subject: "Site novo para Souza Imóveis", message: "Olá Maria, ..." });
await call("log_approach (replied -> replied)", "log_approach", { leadId, channel: "whatsapp", direction: "inbound", outcome: "replied", message: "Pode me mandar mais detalhes?", approachedAt: new Date(Date.now() + 1000).toISOString() });
await call("get_lead", "get_lead", { leadId });
await call("leads_report", "leads_report", { projectSlug: slug });
await rpc("kanban tools/list (create_project added)", "tools/list", {}, { path: "/api/kanban/mcp" });
await call("kanban create_project", "create_project", { name: `Quicksilver ${stamp}`, slug: `quicksilver-${stamp}` }, { path: "/api/kanban/mcp" });

writeFileSync(OUT, JSON.stringify(transcript, null, 2) + "\n");
const names = tools?.result?.tools?.map((t) => t.name) ?? [];
console.log(JSON.stringify({ out: OUT, exchanges: transcript.exchanges.map((e) => `${e.status} ${e.label}${e.response?.result?.isError ? " [isError]" : ""}`), tools: names }, null, 2));
