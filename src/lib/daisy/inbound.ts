import { env } from "@/env";
import * as repo from "@/lib/daisy/repo";
import { isAllowedPreviewUrl } from "@/lib/daisy/preview-allowlist";
import { z } from "zod";
import { daisyRateLimit } from "./ratelimit";
import {
  verifyDaisySignature,
  type VerifyDaisySignatureResult,
} from "./signing";
import {
  DAISY_EVENT_ID_HEADER,
  DAISY_SIGNATURE_HEADER,
  DAISY_TIMESTAMP_HEADER,
  inboundEventSchema,
  messageData,
  previewData,
  projectUpsertData,
  sectionReadyData,
  sketchData,
  type DaisyGate,
  type DaisyMessage,
  type DaisyMessageAuthor,
  type DaisyProject,
  type DaisyProjectStatus,
  type DaisySketch,
  type InboundEventType,
} from "./types";

type ProjectUpsertData = z.infer<typeof projectUpsertData>;
type MessageData = z.infer<typeof messageData>;
type SketchData = z.infer<typeof sketchData>;
type SectionReadyData = z.infer<typeof sectionReadyData>;
type PreviewData = z.infer<typeof previewData>;

export type DaisyInboundDeps = {
  getWebhookSecret: () => string | undefined;
  rateLimit: (
    ip: string,
    kind: "inbound"
  ) => Promise<{ ok: boolean; retryAfter?: number }>;
  verifySignature: (input: {
    secret: string;
    timestamp: string | null | undefined;
    signature: string | null | undefined;
    rawBody: string;
    now?: number;
  }) => VerifyDaisySignatureResult;
  recordInboundEventOnce: (input: {
    id: string;
    type: string;
    projectId: string | null;
    payload: unknown;
  }) => Promise<boolean>;
  getProject: (id: string) => Promise<DaisyProject | null>;
  upsertProject: (input: {
    id: string;
    name: string;
    status: DaisyProjectStatus;
    summary?: string | null;
    currentSection?: string | null;
  }) => Promise<DaisyProject>;
  addMessage: (input: {
    id?: string;
    projectId: string;
    author: DaisyMessageAuthor;
    body: string;
  }) => Promise<DaisyMessage>;
  addSketch: (
    input: Omit<DaisySketch, "status" | "createdAt">
  ) => Promise<DaisySketch>;
  openGate: (input: {
    projectId: string;
    section: string;
    prompt?: string | null;
  }) => Promise<DaisyGate>;
  setPreviewUrl: (projectId: string, url: string | null) => Promise<void>;
  isAllowedPreviewUrl: (url: string | null | undefined) => boolean;
  now?: () => number;
};

export const defaultDeps: DaisyInboundDeps = {
  getWebhookSecret: () => env.DAISY_WEBHOOK_SECRET ?? process.env.DAISY_WEBHOOK_SECRET,
  rateLimit: (ip, kind) => daisyRateLimit(ip, kind),
  verifySignature: verifyDaisySignature,
  recordInboundEventOnce: (input) => repo.recordInboundEventOnce(input),
  getProject: (id) => repo.getProject(id),
  upsertProject: (input) => repo.upsertProject(input),
  addMessage: (input) => repo.addMessage(input),
  addSketch: (input) => repo.addSketch(input),
  openGate: (input) => repo.openGate(input),
  setPreviewUrl: (projectId, url) => repo.setPreviewUrl(projectId, url),
  isAllowedPreviewUrl: (url) => isAllowedPreviewUrl(url),
};

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB

async function ensureProject(projectId: string, deps: DaisyInboundDeps): Promise<void> {
  const existing = await deps.getProject(projectId);
  if (!existing) {
    await deps.upsertProject({
      id: projectId,
      name: projectId,
      status: "active",
    });
  }
}

export async function handleInboundRequest(
  req: Request,
  opts?: {
    expectedType?: InboundEventType;
    deps?: Partial<DaisyInboundDeps>;
  }
): Promise<Response> {
  const deps: DaisyInboundDeps = { ...defaultDeps, ...opts?.deps };

  // 1. Check secret configured
  const secret = deps.getWebhookSecret();
  if (!secret) {
    return Response.json({ error: "daisy_not_configured" }, { status: 503 });
  }

  // 2. Rate limit by client IP (x-forwarded-for first)
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const clientIp = xForwardedFor
    ? xForwardedFor.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "127.0.0.1";

  const rl = await deps.rateLimit(clientIp, "inbound");
  if (!rl.ok) {
    const headers: Record<string, string> = {};
    if (rl.retryAfter !== undefined) {
      headers["Retry-After"] = String(rl.retryAfter);
    }
    return Response.json({ error: "rate_limited" }, { status: 429, headers });
  }

  // 3. Read raw body text (reject > 256KB with 413)
  const rawBody = await req.text();
  const byteLength = Buffer.byteLength(rawBody, "utf8");
  if (byteLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  // 4. Verify Daisy signature
  const timestamp = req.headers.get(DAISY_TIMESTAMP_HEADER);
  const signature = req.headers.get(DAISY_SIGNATURE_HEADER);
  const verifyRes = deps.verifySignature({
    secret,
    timestamp,
    signature,
    rawBody,
    now: deps.now ? deps.now() : undefined,
  });

  if (!verifyRes.ok) {
    return Response.json({ error: verifyRes.code }, { status: 401 });
  }

  // 5. Parse JSON
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // 6. Validate inbound event schema
  const parseRes = inboundEventSchema.safeParse(bodyJson);
  if (!parseRes.success) {
    return Response.json(
      { error: "invalid_payload", issues: parseRes.error.issues },
      { status: 422 }
    );
  }

  const event = parseRes.data;

  // 7. Check expected type if specified
  if (opts?.expectedType && event.type !== opts.expectedType) {
    return Response.json({ error: "type_mismatch" }, { status: 422 });
  }

  // 8. Event ID header check (if present, must match body.id)
  const headerEventId = req.headers.get(DAISY_EVENT_ID_HEADER);
  if (headerEventId && headerEventId !== event.id) {
    return Response.json({ error: "event_id_mismatch" }, { status: 400 });
  }

  // 9. For preview.updated, validate origin BEFORE recording the event
  if (event.type === "preview.updated") {
    const data = event.data as PreviewData;
    if (!deps.isAllowedPreviewUrl(data.previewUrl)) {
      return Response.json(
        { error: "preview_origin_not_allowed" },
        { status: 422 }
      );
    }
  }

  // 10. Record inbound event once (deduplication)
  const recorded = await deps.recordInboundEventOnce({
    id: event.id,
    type: event.type,
    projectId: (event.data as { projectId?: string }).projectId ?? null,
    payload: event.data,
  });

  if (!recorded) {
    return Response.json({ ok: true, duplicate: true }, { status: 200 });
  }

  // 11. Apply the event
  switch (event.type) {
    case "project.upserted": {
      const data = event.data as ProjectUpsertData;
      await deps.upsertProject({
        id: data.projectId,
        name: data.name,
        status: data.status,
        summary: data.summary ?? undefined,
        currentSection: data.currentSection ?? undefined,
      });
      break;
    }
    case "message.created": {
      const data = event.data as MessageData;
      await ensureProject(data.projectId, deps);
      await deps.addMessage({
        id: data.messageId,
        projectId: data.projectId,
        author: "daisy",
        body: data.body,
      });
      break;
    }
    case "sketch.created": {
      const data = event.data as SketchData;
      await ensureProject(data.projectId, deps);
      await deps.addSketch({
        id: data.sketchId,
        projectId: data.projectId,
        groupId: data.groupId ?? null,
        section: data.section ?? null,
        label: data.label,
        kind: data.kind,
        imageUrl: data.imageUrl ?? null,
        url: data.url ?? null,
      });
      break;
    }
    case "section.ready": {
      const data = event.data as SectionReadyData;
      await ensureProject(data.projectId, deps);
      await deps.openGate({
        projectId: data.projectId,
        section: data.section,
        prompt: data.prompt ?? null,
      });
      break;
    }
    case "preview.updated": {
      const data = event.data as PreviewData;
      await ensureProject(data.projectId, deps);
      await deps.setPreviewUrl(data.projectId, data.previewUrl);
      break;
    }
  }

  return Response.json(
    { ok: true, id: event.id, type: event.type },
    { status: 200 }
  );
}
