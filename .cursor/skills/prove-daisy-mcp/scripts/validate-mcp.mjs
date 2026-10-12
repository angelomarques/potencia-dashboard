// E2E prove for the Daisy MCP endpoint (/api/mcp). Run from the repo root (needs @modelcontextprotocol/sdk, playwright-core).
import fs from "node:fs"; import crypto from "node:crypto"; import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:43211";
const OUT = process.env.OUT || "/workspace/daisy-mcp-evidence";
const [CURSOR_TOK, AGY_TOK] = (process.env.DAISY_MCP_TOKENS || "").split(",").map((e) => e.slice(e.indexOf(":") + 1));
fs.mkdirSync(OUT, { recursive: true });
const results = []; const log = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); };
const P = `mcp-prove-${Date.now().toString(36)}`;
const PNG = fs.readFileSync(process.env.SAMPLE_PNG || "/tmp/mcp-sample.png");

async function connect(token) {
  const c = new Client({ name: "prove", version: "0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(BASE + "/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
}
const call = async (c, name, args) => {
  const r = await c.callTool({ name, arguments: args });
  log.push({ tool: name, args: { ...args, imageBase64: args.imageBase64 ? `<${args.imageBase64.length} chars>` : undefined }, isError: !!r.isError, result: r.content?.[0]?.text?.slice(0, 2000) });
  return { r, json: r.isError ? null : JSON.parse(r.content[0].text) };
};

// --- auth ---
const rpc = (auth) => fetch(BASE + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
check("auth: no token -> 401", (await rpc()).status === 401);
check("auth: wrong token -> 401", (await rpc("Bearer " + "x".repeat(40))).status === 401);

const cur = await connect(CURSOR_TOK);
const agy = await connect(AGY_TOK);
const tools = (await cur.listTools()).tools.map((t) => t.name).sort();
check("tools/list (cursor token)", ["get_feedback", "list_projects", "post_message", "push_sketch", "update_sketch", "upsert_project"].every((t) => tools.includes(t)), tools.join(","));
check("tools/list (antigravity token)", (await agy.listTools()).tools.length === tools.length);

// --- writes ---
let x = await call(cur, "upsert_project", { projectId: P, name: "MCP prove — landing", summary: "Pushed by coding agents via /api/mcp", currentSection: "Hero" });
check("upsert_project", x.json?.ok === true, x.r.content[0].text.slice(0, 120));
x = await call(cur, "list_projects", {});
check("list_projects contains project", x.json?.projects?.some((p) => p.id === P));
x = await call(cur, "push_sketch", { projectId: P, sketchId: "hero-a", groupId: "hero", section: "Hero", label: "Hero A — bold gradient", kind: "card", imageUrl: "https://placehold.co/640x360/7c3aed/ffffff/png?text=Hero+A+(MCP)" });
check("push_sketch (imageUrl)", x.json?.ok === true);
x = await call(cur, "push_sketch", { projectId: P, sketchId: "hero-b", groupId: "hero", section: "Hero", label: "Hero B — uploaded via base64", kind: "card", round: "r1", filename: "hero-b", imageBase64: `data:image/png;base64,${PNG.toString("base64")}` });
const r2Url = x.json?.imageUrl;
check("push_sketch (base64 -> R2 daisy-sketches)", x.json?.ok === true && x.json?.storageKey === `${P}/r1/hero-b.png`, `${x.json?.storageKey} ${r2Url}`);
if (process.env.DAISY_SKETCH_R2_BUCKET && process.env.DAISY_SKETCH_R2_BUCKET !== "daisy-sketches") {
  // Local key cannot write daisy-sketches: verify the object landed in the substitute bucket via HeadObject.
  const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: "auto", endpoint: process.env.CLOUDFLARE_R2_ENDPOINT, credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY } });
  const h = await s3.send(new HeadObjectCommand({ Bucket: process.env.DAISY_SKETCH_R2_BUCKET, Key: x.json?.storageKey ?? "missing" })).catch((e) => ({ err: e.name }));
  check("R2 object exists (HeadObject, substitute bucket)", h?.ContentType === "image/png" && h?.ContentLength === PNG.length, `${h?.ContentType ?? h?.err} ${h?.ContentLength ?? ""}`);
} else {
  const pub = r2Url ? await fetch(r2Url) : null;
  check("R2 public URL serves the uploaded image", pub?.status === 200 && (pub.headers.get("content-type") || "").startsWith("image/png"), `${pub?.status} ${pub?.headers.get("content-type")}`);
}
x = await call(cur, "update_sketch", { projectId: P, sketchId: "hero-a", label: "Hero A — bold gradient (v2)" });
check("update_sketch (partial; keeps image)", x.json?.ok === true && x.json?.type === "sketch.updated");
x = await call(cur, "update_sketch", { projectId: P, sketchId: "missing", label: "x" });
check("update_sketch unknown sketch -> tool error", x.r.isError === true);
x = await call(cur, "push_sketch", { projectId: P, label: "bad", imageUrl: "http://insecure.example/a.png" });
check("push_sketch rejects http image", x.r.isError === true);
const runKey = "run-" + crypto.randomUUID().slice(0, 8);
x = await call(cur, "post_message", { projectId: P, idempotencyKey: runKey, body: "Run finished: 2 hero directions (A gradient, B uploaded). Pick one and pin tweaks." });
check("post_message", x.json?.ok === true);
x = await call(cur, "post_message", { projectId: P, idempotencyKey: runKey, body: "dup" });
check("post_message idempotent (duplicate:true)", x.json?.duplicate === true);
x = await call(agy, "post_message", { projectId: P, body: "Antigravity here: also generated the mobile variant." });
check("post_message from second agent", x.json?.ok === true);
x = await call(cur, "get_feedback", { projectId: P });
const cursor0 = x.json?.cursor;
check("get_feedback before owner input: no owner messages/comments", x.json?.messages?.length === 0 && x.json?.sketches?.every((s) => s.comments.length === 0));

// --- stdio fallback (filePath upload) ---
const stdio = new Client({ name: "prove-stdio", version: "0" });
await stdio.connect(new StdioClientTransport({ command: "node", args: ["scripts/daisy-mcp-stdio.mjs"], env: { ...process.env, DAISY_MCP_URL: BASE + "/api/mcp", DAISY_MCP_TOKEN: AGY_TOK }, stderr: "inherit" }));
const st = (await stdio.listTools()).tools.find((t) => t.name === "push_sketch");
check("stdio proxy lists push_sketch with filePath", !!st?.inputSchema?.properties?.filePath);
x = await call(stdio, "push_sketch", { projectId: P, sketchId: "hero-c", groupId: "hero", section: "Hero", label: "Hero C — local file via stdio", round: "r1", filePath: process.env.SAMPLE_PNG || "/tmp/mcp-sample.png" });
check("stdio push_sketch filePath -> R2", x.json?.ok === true && /\/r1\//.test(x.json?.storageKey || ""), x.json?.storageKey);
await stdio.close();

// --- owner acts in the UI ---
const su = await fetch(BASE + "/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: "angelo@example.com", password: "local-evidence-pw-123", name: "Ângelo" }) });
let setCookies = su.headers.getSetCookie?.() ?? [];
if (!su.ok) {
  const si = await fetch(BASE + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email: "angelo@example.com", password: "local-evidence-pw-123" }) });
  setCookies = si.headers.getSetCookie?.() ?? [];
}
const cookies = setCookies.map((c) => { const [nv] = c.split(";"); const i = nv.indexOf("="); return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: "localhost", path: "/" }; });
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const shot = async (n) => { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
await page.goto(BASE + "/daisy"); await page.waitForSelector('[data-testid="daisy-project-card"]');
await shot("01-projects-list");
await page.goto(BASE + "/daisy/" + P); await page.waitForSelector('[data-testid="daisy-slideshow"]');
const msgs = await page.locator('[data-testid="thread-message"]').allTextContents();
check("UI: agent messages rendered (attributed)", msgs.some((m) => m.includes("[cursor]")) && msgs.some((m) => m.includes("[antigravity]")), `n=${msgs.length}`);
const counter = await page.locator('[data-testid="slide-counter"]').first().textContent();
check("UI: slideshow shows 3 MCP sketches", /\b3\b/.test(counter), counter);
await shot("02-project-pushed-by-mcp");
for (const sel of ['[data-testid="slide-next"]', '[data-testid="slide-prev"]']) { const b = page.locator(sel).first(); if (await b.isEnabled()) { await b.click(); break; } }
await page.waitForTimeout(500);
await shot("03-r2-uploaded-sketch");
await page.locator('[data-testid="choose-sketch"]').first().click(); await page.waitForTimeout(1500);
await page.locator('[data-testid="sketch-comment-input"], [data-testid="comment-input"]').first().fill("Love B — make the headline 20% bigger.");
await page.locator('[data-testid="comment-submit"]').first().click(); await page.waitForSelector('[data-testid="sketch-comment"]');
await page.locator('[data-testid="message-input"]').fill("Great run. Next: do the Features section."); await page.locator('[data-testid="message-send"]').click(); await page.waitForTimeout(1500);
await shot("04-owner-feedback");
await ctx.close(); await browser.close();

// --- agent reads feedback ---
x = await call(agy, "get_feedback", { projectId: P, since: cursor0 });
const fb = x.json;
fs.writeFileSync(`${OUT}/get_feedback.json`, JSON.stringify(fb, null, 2));
check("get_feedback: owner chat message", fb?.messages?.some((m) => m.author === "owner" && /Features/.test(m.body)));
check("get_feedback: sketch comment", fb?.sketches?.some((s) => s.comments.some((c) => /headline/.test(c.body))));
check("get_feedback: chosen/rejected statuses", fb?.sketches?.some((s) => s.status === "chosen") && fb?.sketches?.some((s) => s.status === "rejected"), fb?.sketches?.map((s) => `${s.id}:${s.status}`).join(","));
x = await call(agy, "get_feedback", { projectId: P, since: fb?.cursor });
check("get_feedback: cursor => nothing new", x.json?.messages?.length === 0 && x.json?.sketches?.every((s) => s.comments.length === 0));

await cur.close(); await agy.close();
fs.writeFileSync(`${OUT}/mcp-transcript.json`, JSON.stringify(log, null, 2));
fs.writeFileSync(`${OUT}/validation-report.json`, JSON.stringify({ at: new Date().toISOString(), project: P, results }, null, 2));
console.log(results.every((r) => r.ok) ? "ALL PASS" : "SOME FAILED");
process.exit(results.every((r) => r.ok) ? 0 : 1);
