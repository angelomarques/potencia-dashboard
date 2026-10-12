import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as repo from "@/lib/daisy/repo";
import { applyInboundEvent, type ApplyInboundResult } from "@/lib/daisy/inbound";
import {
  DAISY_PROJECT_STATUSES,
  inboundEventSchema,
  type DaisyProject,
  type DaisySketch,
  type DaisyThreadItem,
} from "@/lib/daisy/types";
import type { McpAgent } from "./auth";
import { decodeBase64Image, uploadSketchImage, withExtension, type UploadSketchImage } from "./sketch-storage";

export type DaisyMcpDeps = {
  /** Validated event -> same idempotent apply path as the signed webhook. */
  applyEvent: (event: unknown) => Promise<ApplyInboundResult>;
  listProjects: () => Promise<DaisyProject[]>;
  getProject: (id: string) => Promise<DaisyProject | null>;
  getSketch: (id: string, projectId: string) => Promise<DaisySketch | null>;
  listThread: (projectId: string) => Promise<DaisyThreadItem[]>;
  uploadImage: UploadSketchImage;
  fetchImage: (url: string) => Promise<{ bytes: Buffer; mime: string }>;
  newId: () => string;
};

async function defaultFetchImage(url: string) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`fetch_failed: ${r.status}`);
  const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = Buffer.from(await r.arrayBuffer());
  return { bytes, mime };
}

export const defaultMcpDeps: DaisyMcpDeps = {
  applyEvent: async (raw) => {
    const parsed = inboundEventSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: 422, body: { error: `invalid_payload: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` } };
    }
    return applyInboundEvent(parsed.data);
  },
  listProjects: () => repo.listProjects(),
  getProject: (id) => repo.getProject(id),
  getSketch: (id, projectId) => repo.getSketch(id, projectId),
  listThread: (projectId) => repo.listThread(projectId),
  uploadImage: uploadSketchImage,
  fetchImage: defaultFetchImage,
  newId: () => crypto.randomUUID(),
};

const projectId = z.string().min(1).max(128).describe("Stable project id (slug), e.g. 'acme-landing'");
const httpsUrl = z.string().url().max(2048).refine((u) => u.startsWith("https://"), "must be https");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
const ok = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

function outcome(r: ApplyInboundResult, extra: Record<string, unknown> = {}): ToolResult {
  if ("error" in r.body) return fail(`${r.body.error} (status ${r.status})`);
  return ok({ ...r.body, ...extra });
}

export function createDaisyMcpServer(agent: McpAgent, overrides: Partial<DaisyMcpDeps> = {}): McpServer {
  const deps: DaisyMcpDeps = { ...defaultMcpDeps, ...overrides };
  const eventId = (key?: string) => `mcp_${agent.name}_${key ?? deps.newId()}`;

  const server = new McpServer(
    { name: "daisy-studio", version: "1.0.0" },
    {
      instructions:
        "Daisy Studio (Potencia dashboard /daisy). After a sketch/design run: upsert_project, push_sketch for each image, " +
        "post_message with a short run summary. Before iterating, call get_feedback to read the owner's comments and choices.",
    }
  );

  server.registerTool(
    "list_projects",
    { description: "List Daisy Studio projects (newest activity first).", inputSchema: { status: z.enum(DAISY_PROJECT_STATUSES).optional() } },
    async ({ status }) => {
      const projects = (await deps.listProjects()).filter((p) => !status || p.status === status);
      return ok({ projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, summary: p.summary, currentSection: p.currentSection })) });
    }
  );

  server.registerTool(
    "upsert_project",
    {
      description: "Create or update a project (by projectId).",
      inputSchema: {
        projectId,
        name: z.string().min(1).max(200),
        status: z.enum(DAISY_PROJECT_STATUSES).optional(),
        summary: z.string().max(2000).optional(),
        currentSection: z.string().max(200).optional(),
      },
    },
    async (a) =>
      outcome(
        await deps.applyEvent({ id: eventId(), type: "project.upserted", data: { ...a, status: a.status ?? "active" } }),
        { projectId: a.projectId }
      )
  );

  server.registerTool(
    "push_sketch",
    {
      description:
        "Add (or replace, same sketchId) a sketch. Provide exactly one image source: imageUrl (https, used as-is), " +
        "imageBase64 (raw or data: URL; uploaded to R2 daisy-sketches at <project>/<round>/<file>), or sourceUrl " +
        "(fetched by the server and re-hosted on R2). Optionally url: link to a live sketch page.",
      inputSchema: {
        projectId,
        sketchId: z.string().min(1).max(128).optional().describe("Stable id; reuse it to replace a sketch. Default: generated."),
        label: z.string().min(1).max(200),
        round: z.string().min(1).max(64).optional().describe("Round / iteration name, e.g. 'r1'. Default 'r1'."),
        section: z.string().max(200).optional(),
        groupId: z.string().max(128).optional().describe("Sketches sharing a groupId are alternatives the owner chooses between."),
        kind: z.enum(["card", "slide"]).optional(),
        imageUrl: httpsUrl.optional(),
        imageBase64: z.string().max(14_500_000).optional(),
        contentType: z.string().max(64).optional().describe("MIME type for imageBase64 when not a data: URL"),
        filename: z.string().max(120).optional(),
        sourceUrl: httpsUrl.optional(),
        url: httpsUrl.optional(),
      },
    },
    async (a) => {
      const sources = [a.imageUrl, a.imageBase64, a.sourceUrl].filter(Boolean).length;
      if (sources > 1) return fail("provide only one of imageUrl, imageBase64, sourceUrl");
      if (sources === 0 && !a.url) return fail("provide an image (imageUrl, imageBase64, sourceUrl) or a url");
      const sketchId = a.sketchId ?? deps.newId();
      let imageUrl = a.imageUrl;
      let storageKey: string | undefined;
      try {
        if (a.imageBase64 || a.sourceUrl) {
          const img = a.imageBase64
            ? decodeBase64Image(a.imageBase64, a.contentType)
            : await deps.fetchImage(a.sourceUrl!).then((f) => decodeBase64Image(f.bytes.toString("base64"), f.mime));
          const up = await deps.uploadImage({
            projectId: a.projectId,
            round: a.round ?? "r1",
            filename: withExtension(a.filename ?? sketchId, img.mime),
            bytes: img.bytes,
            mime: img.mime,
          });
          imageUrl = up.url;
          storageKey = up.key;
        }
      } catch (e) {
        return fail(`upload_failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      const data = {
        projectId: a.projectId,
        sketchId,
        label: a.label,
        ...(a.section !== undefined && { section: a.section }),
        ...(a.groupId !== undefined && { groupId: a.groupId }),
        ...(a.kind !== undefined && { kind: a.kind }),
        ...(imageUrl && { imageUrl }),
        ...(a.url && { url: a.url }),
      };
      return outcome(await deps.applyEvent({ id: eventId(), type: "sketch.created", data }), {
        projectId: a.projectId,
        sketchId,
        imageUrl: imageUrl ?? null,
        ...(storageKey && { storageKey }),
      });
    }
  );

  server.registerTool(
    "update_sketch",
    {
      description: "Update fields of an existing sketch (label, imageUrl, url, section, groupId, kind). Unspecified fields are kept.",
      inputSchema: {
        projectId,
        sketchId: z.string().min(1).max(128),
        label: z.string().min(1).max(200).optional(),
        section: z.string().max(200).optional(),
        groupId: z.string().max(128).optional(),
        kind: z.enum(["card", "slide"]).optional(),
        imageUrl: httpsUrl.optional(),
        url: httpsUrl.optional(),
      },
    },
    async (a) => {
      const existing = await deps.getSketch(a.sketchId, a.projectId);
      if (!existing) return fail(`sketch_not_found: ${a.projectId}/${a.sketchId}`);
      const data = {
        projectId: a.projectId,
        sketchId: a.sketchId,
        label: a.label ?? existing.label,
        ...(a.section !== undefined && { section: a.section }),
        ...(a.groupId !== undefined && { groupId: a.groupId }),
        ...(a.kind !== undefined && { kind: a.kind }),
        ...((a.imageUrl ?? existing.imageUrl) && { imageUrl: a.imageUrl ?? existing.imageUrl }),
        ...((a.url ?? existing.url) && { url: a.url ?? existing.url }),
      };
      return outcome(await deps.applyEvent({ id: eventId(), type: "sketch.updated", data }), {
        projectId: a.projectId,
        sketchId: a.sketchId,
      });
    }
  );

  server.registerTool(
    "post_message",
    {
      description: "Post a message (e.g. a run summary) to the project's chat thread. Markdown allowed.",
      inputSchema: {
        projectId,
        body: z.string().min(1).max(19000),
        idempotencyKey: z.string().min(1).max(64).optional().describe("Retry-safe key; same key => posted once."),
      },
    },
    async (a) => {
      const messageId = a.idempotencyKey ? `mcp_${agent.name}_${a.idempotencyKey}` : `mcp_${agent.name}_${deps.newId()}`;
      return outcome(
        await deps.applyEvent({
          id: eventId(a.idempotencyKey),
          type: "message.created",
          data: { projectId: a.projectId, messageId, body: `[${agent.name}] ${a.body}` },
        }),
        { projectId: a.projectId, messageId }
      );
    }
  );

  server.registerTool(
    "get_feedback",
    {
      description:
        "Read owner feedback to iterate: chat messages from the owner, comments on each sketch (with optional x/y pin 0..1), " +
        "sketch choices (chosen/rejected) and section gates (notes, references). Use `since` to get only new items.",
      inputSchema: {
        projectId,
        since: z.union([z.number(), z.string().datetime()]).optional().describe("Epoch ms or ISO time; only items after it"),
        sketchId: z.string().max(128).optional(),
        includeAgentMessages: z.boolean().optional().describe("Also include daisy/agent messages (default false)"),
      },
    },
    async (a) => {
      const project = await deps.getProject(a.projectId);
      if (!project) return fail(`project_not_found: ${a.projectId}`);
      const since = a.since === undefined ? 0 : typeof a.since === "number" ? a.since : Date.parse(a.since);
      const iso = (t: number) => new Date(t).toISOString();
      const thread = await deps.listThread(a.projectId);
      const messages: unknown[] = [];
      const sketches: unknown[] = [];
      const gates: unknown[] = [];
      let latest = since;
      for (const item of thread) {
        if (item.type === "message") {
          const m = item.message;
          if (m.createdAt <= since || (!a.includeAgentMessages && m.author === "daisy")) continue;
          latest = Math.max(latest, m.createdAt);
          messages.push({ id: m.id, author: m.author, body: m.body, at: iso(m.createdAt) });
        } else if (item.type === "sketch") {
          const s = item.sketch;
          if (a.sketchId && s.id !== a.sketchId) continue;
          const comments = item.comments.filter((c) => c.createdAt > since);
          for (const c of comments) latest = Math.max(latest, c.createdAt);
          if (!comments.length && s.status === "proposed" && since > 0) continue;
          sketches.push({
            id: s.id, label: s.label, status: s.status, groupId: s.groupId, section: s.section, imageUrl: s.imageUrl,
            comments: comments.map((c) => ({ id: c.id, author: c.author ?? "owner", body: c.body, x: c.x, y: c.y, at: iso(c.createdAt) })),
          });
        } else if (!a.sketchId) {
          const g = item.gate;
          const t = g.resolvedAt ?? g.createdAt;
          if (t <= since) continue;
          latest = Math.max(latest, t);
          gates.push({ id: g.id, section: g.section, status: g.status, prompt: g.prompt, notes: g.notes, references: g.references.map((r) => r.filename) });
        }
      }
      return ok({
        project: { id: project.id, name: project.name, status: project.status },
        messages,
        sketches,
        gates,
        cursor: latest,
        hint: "Pass `cursor` as `since` next time to get only new feedback.",
      });
    }
  );

  return server;
}
