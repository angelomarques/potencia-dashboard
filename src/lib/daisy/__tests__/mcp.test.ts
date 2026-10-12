/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { applyInboundEvent, defaultDeps, type DaisyInboundDeps } from "../inbound";
import { inboundEventSchema, type DaisyProject, type DaisySketch, type DaisyThreadItem } from "../types";
import { parseMcpTokens, verifyMcpAuth } from "../mcp/auth";
import { decodeBase64Image, sketchKey, withExtension } from "../mcp/sketch-storage";
import { createDaisyMcpServer, type DaisyMcpDeps } from "../mcp/server";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TOK_A = "a".repeat(32);
const TOK_B = "b".repeat(32);

describe("verifyMcpAuth", () => {
  const raw = `cursor:${TOK_A}, antigravity:${TOK_B},bad:short,:nope`;
  it("parses valid entries only", () => {
    expect(parseMcpTokens(raw).map((t) => t.name)).toEqual(["cursor", "antigravity"]);
  });
  it("identifies the agent by token", () => {
    expect(verifyMcpAuth(`Bearer ${TOK_B}`, raw)).toEqual({ ok: true, agent: { name: "antigravity" } });
    expect(verifyMcpAuth(`bearer ${TOK_A}`, raw)).toMatchObject({ ok: true, agent: { name: "cursor" } });
  });
  it("rejects missing / wrong / unconfigured", () => {
    expect(verifyMcpAuth(null, raw)).toMatchObject({ ok: false, status: 401, code: "missing_authorization" });
    expect(verifyMcpAuth(`Bearer ${"c".repeat(32)}`, raw)).toMatchObject({ ok: false, status: 401 });
    expect(verifyMcpAuth("Bearer short", raw)).toMatchObject({ ok: false, status: 401 });
    expect(verifyMcpAuth(`Bearer ${TOK_A}`, undefined)).toMatchObject({ ok: false, status: 503 });
  });
});

describe("sketch storage helpers", () => {
  it("builds <project>/<round>/<file> keys, sanitized", () => {
    expect(sketchKey({ projectId: "acme landing", round: "r2", filename: "../hero v1.png" })).toBe("acme_landing/r2/hero_v1.png");
    expect(withExtension("hero", "image/webp")).toBe("hero.webp");
  });
  it("decodes data URLs and raw base64", () => {
    expect(decodeBase64Image(`data:image/png;base64,${PNG_1PX}`).mime).toBe("image/png");
    expect(decodeBase64Image(PNG_1PX, "image/png").bytes.length).toBeGreaterThan(10);
    expect(() => decodeBase64Image(PNG_1PX)).toThrow(/unsupported_content_type/);
    expect(() => decodeBase64Image("data:text/html;base64,PGI+")).toThrow(/unsupported/);
  });
});

describe("Daisy MCP server (in-memory transport, real inbound apply path)", () => {
  let recorded: Set<string>;
  let projects: Map<string, DaisyProject>;
  let sketches: Map<string, DaisySketch>;
  let messages: any[];
  let uploads: any[];
  let client: Client;
  let thread: DaisyThreadItem[];

  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { ...r, json: r.isError ? null : JSON.parse(r.content[0].text) };
  };

  beforeEach(async () => {
    recorded = new Set();
    projects = new Map();
    sketches = new Map();
    messages = [];
    uploads = [];
    thread = [];
    let n = 0;
    const inboundDeps: DaisyInboundDeps = {
      ...defaultDeps,
      recordInboundEventOnce: async ({ id }) => (recorded.has(id) ? false : (recorded.add(id), true)),
      getProject: async (id) => projects.get(id) ?? null,
      upsertProject: async (p) => {
        const proj = { ...p, summary: p.summary ?? null, currentSection: p.currentSection ?? null } as any;
        projects.set(p.id, proj);
        return proj;
      },
      addMessage: async (m) => (messages.push(m), m as any),
      addSketch: async (s) => s as any,
      upsertSketch: async (s) => {
        const prev = sketches.get(s.id);
        const next = { ...prev, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as any;
        sketches.set(s.id, next);
        return next;
      },
      getSketch: async (id) => sketches.get(id) ?? null,
      openGate: async (g) => g as any,
      setPreviewUrl: async () => {},
      isAllowedPreviewUrl: () => true,
    };
    const deps: Partial<DaisyMcpDeps> = {
      applyEvent: async (raw) => {
        const parsed = inboundEventSchema.safeParse(raw);
        if (!parsed.success) return { status: 422, body: { error: "invalid_payload" } };
        return applyInboundEvent(parsed.data, inboundDeps);
      },
      listProjects: async () => [...projects.values()],
      getProject: async (id) => projects.get(id) ?? null,
      getSketch: async (id) => sketches.get(id) ?? null,
      listThread: async () => thread,
      uploadImage: async (u) => {
        uploads.push(u);
        return { key: sketchKey(u), url: `https://pub.example.r2.dev/${sketchKey(u)}` };
      },
      fetchImage: async () => ({ bytes: Buffer.from(PNG_1PX, "base64"), mime: "image/png" }),
      newId: () => `id${++n}`,
    };
    const server = createDaisyMcpServer({ name: "cursor" }, deps);
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
  });

  it("lists the expected tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["get_feedback", "list_projects", "post_message", "push_sketch", "update_sketch", "upsert_project"].sort()
    );
  });

  it("upsert_project + list_projects", async () => {
    const r = await call("upsert_project", { projectId: "acme", name: "Acme", summary: "Landing" });
    expect(r.json).toMatchObject({ ok: true, type: "project.upserted" });
    expect([...recorded][0]).toMatch(/^mcp_cursor_/);
    const l = await call("list_projects", {});
    expect(l.json.projects).toEqual([expect.objectContaining({ id: "acme", name: "Acme", status: "active" })]);
  });

  it("push_sketch with imageUrl auto-creates project", async () => {
    const r = await call("push_sketch", { projectId: "p1", sketchId: "s1", label: "Hero A", imageUrl: "https://x.example/a.png" });
    expect(r.json).toMatchObject({ ok: true, sketchId: "s1", imageUrl: "https://x.example/a.png" });
    expect(projects.has("p1")).toBe(true);
    expect(sketches.get("s1")).toMatchObject({ projectId: "p1", label: "Hero A" });
  });

  it("push_sketch with base64 uploads to R2 at <project>/<round>/<file>", async () => {
    const r = await call("push_sketch", {
      projectId: "p1", sketchId: "s2", label: "Hero B", round: "r3", filename: "hero-b",
      imageBase64: `data:image/png;base64,${PNG_1PX}`, groupId: "hero",
    });
    expect(r.json.storageKey).toBe("p1/r3/hero-b.png");
    expect(uploads[0]).toMatchObject({ projectId: "p1", round: "r3", mime: "image/png" });
    expect(sketches.get("s2")).toMatchObject({ imageUrl: "https://pub.example.r2.dev/p1/r3/hero-b.png", groupId: "hero" });
  });

  it("push_sketch with sourceUrl re-hosts the image", async () => {
    const r = await call("push_sketch", { projectId: "p1", label: "From URL", sourceUrl: "https://x.example/b.png" });
    expect(r.json.storageKey).toMatch(/^p1\/r1\/id\d+\.png$/);
  });

  it("push_sketch validates image sources", async () => {
    expect((await call("push_sketch", { projectId: "p", label: "x" })).isError).toBe(true);
    expect((await call("push_sketch", { projectId: "p", label: "x", imageUrl: "https://a.b/c.png", imageBase64: PNG_1PX })).isError).toBe(true);
    const bad = await call("push_sketch", { projectId: "p", label: "x", imageBase64: PNG_1PX });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/unsupported_content_type/);
    expect(uploads).toHaveLength(0);
  });

  it("update_sketch merges with the existing sketch", async () => {
    await call("push_sketch", { projectId: "p1", sketchId: "s1", label: "Hero A", imageUrl: "https://x.example/a.png" });
    const r = await call("update_sketch", { projectId: "p1", sketchId: "s1", label: "Hero A v2" });
    expect(r.json).toMatchObject({ ok: true, type: "sketch.updated" });
    expect(sketches.get("s1")).toMatchObject({ label: "Hero A v2", imageUrl: "https://x.example/a.png" });
    expect((await call("update_sketch", { projectId: "p1", sketchId: "nope", label: "z" })).isError).toBe(true);
  });

  it("post_message is attributed and idempotent", async () => {
    await call("post_message", { projectId: "p1", body: "Run done: 3 heroes", idempotencyKey: "run-42" });
    const again = await call("post_message", { projectId: "p1", body: "Run done: 3 heroes", idempotencyKey: "run-42" });
    expect(again.json).toMatchObject({ ok: true, duplicate: true });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ author: "daisy", body: "[cursor] Run done: 3 heroes", id: "mcp_cursor_run-42" });
  });

  it("get_feedback returns owner messages, sketch comments/choices, gates and a cursor", async () => {
    projects.set("p1", { id: "p1", name: "P1", status: "active" } as any);
    const sk = (id: string, status: string, comments: any[]) =>
      ({ type: "sketch", at: 1, sketch: { id, label: id, status, groupId: "g", section: null, imageUrl: null }, comments }) as any;
    thread = [
      { type: "message", at: 100, message: { id: "m1", projectId: "p1", author: "daisy", body: "agent", createdAt: 100 } },
      { type: "message", at: 200, message: { id: "m2", projectId: "p1", author: "owner", body: "bolder", createdAt: 200 } },
      sk("s1", "chosen", [{ id: "c1", sketchId: "s1", body: "love it", x: 0.2, y: 0.5, createdAt: 300 }]),
      sk("s2", "rejected", []),
      { type: "gate", at: 400, gate: { id: "g1", section: "hero", status: "submitted", prompt: null, notes: "use blue", references: [{ filename: "ref.png" }], createdAt: 400, resolvedAt: 450 } } as any,
    ];
    const r = await call("get_feedback", { projectId: "p1" });
    expect(r.json.messages).toEqual([expect.objectContaining({ id: "m2", author: "owner", body: "bolder" })]);
    expect(r.json.sketches.find((s: any) => s.id === "s1")).toMatchObject({ status: "chosen", comments: [expect.objectContaining({ body: "love it", x: 0.2 })] });
    expect(r.json.gates[0]).toMatchObject({ notes: "use blue", references: ["ref.png"] });
    expect(r.json.cursor).toBe(450);
    const later = await call("get_feedback", { projectId: "p1", since: 450 });
    expect(later.json.messages).toEqual([]);
    expect(later.json.gates).toEqual([]);
    expect((await call("get_feedback", { projectId: "missing" })).isError).toBe(true);
  });
});
