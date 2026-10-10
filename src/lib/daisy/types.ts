/**
 * Daisy studio — shared contract (all sessions code against this file; do not rename exports).
 */
import { z } from "zod";

export const DAISY_PROJECT_STATUSES = ["active", "done"] as const;
export type DaisyProjectStatus = (typeof DAISY_PROJECT_STATUSES)[number];

export type DaisyProject = {
  id: string; // Daisy's external project id (stable string)
  name: string;
  status: DaisyProjectStatus;
  summary: string | null;
  previewUrl: string | null; // only stored when allowlisted
  currentSection: string | null;
  createdAt: number; // epoch ms
  updatedAt: number;
  lastActivityAt: number;
};

export type DaisyMessageAuthor = "daisy" | "owner" | "system";
export type DaisyMessage = {
  id: string;
  projectId: string;
  author: DaisyMessageAuthor;
  body: string;
  createdAt: number;
};

export type DaisySketchKind = "card" | "slide";
export type DaisySketchStatus = "proposed" | "chosen" | "rejected";
export type DaisySketch = {
  id: string;
  projectId: string;
  groupId: string | null; // sketches sharing a groupId are alternatives to choose between
  section: string | null;
  label: string;
  kind: DaisySketchKind;
  imageUrl: string | null; // https image URL (Daisy-hosted) or null
  url: string | null; // https link to sketch page, or null
  status: DaisySketchStatus;
  createdAt: number;
};

export type DaisyComment = {
  id: string;
  projectId: string;
  sketchId: string; // pinned to this sketch
  body: string;
  x: number | null; // optional pin position 0..1
  y: number | null;
  createdAt: number;
};

export type DaisyGateStatus = "open" | "continued" | "submitted";
export type DaisyGate = {
  id: string;
  projectId: string;
  section: string;
  prompt: string | null;
  status: DaisyGateStatus;
  notes: string | null;
  references: DaisyReference[];
  createdAt: number;
  resolvedAt: number | null;
};

export type DaisyReference = {
  key: string; // R2 object key
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/** Timeline item for the project thread (merged, sorted by createdAt asc). */
export type DaisyThreadItem =
  | { type: "message"; at: number; message: DaisyMessage }
  | { type: "sketch"; at: number; sketch: DaisySketch; comments: DaisyComment[] }
  | { type: "gate"; at: number; gate: DaisyGate };

export type DaisyEventDirection = "inbound" | "outbound";
export type DaisyOutboundStatus = "pending" | "delivered" | "failed" | "acked";

/** Stored event row (both directions). */
export type DaisyEvent = {
  id: string; // event id (uuid). inbound: Daisy-provided; outbound: generated
  seq: number; // monotonically increasing integer (cursor for pull endpoint)
  direction: DaisyEventDirection;
  type: string;
  projectId: string | null;
  payload: unknown;
  status: DaisyOutboundStatus | "received";
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  createdAt: number;
  deliveredAt: number | null;
};

/* ---------- Inbound (Daisy -> dashboard) event schemas ---------- */
const httpsUrl = z.string().url().max(2048).refine((u) => u.startsWith("https://"), "must be https");

export const inboundEnvelope = <T extends z.ZodTypeAny>(type: string, data: T) =>
  z.object({
    id: z.string().min(8).max(128), // idempotency key
    type: z.literal(type),
    createdAt: z.string().datetime().optional(),
    data,
  });

export const projectUpsertData = z.object({
  projectId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  status: z.enum(DAISY_PROJECT_STATUSES).default("active"),
  summary: z.string().max(2000).nullish(),
  currentSection: z.string().max(200).nullish(),
});
export const messageData = z.object({
  projectId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128).optional(),
  body: z.string().min(1).max(20000),
});
export const sketchData = z.object({
  projectId: z.string().min(1).max(128),
  sketchId: z.string().min(1).max(128),
  groupId: z.string().max(128).nullish(),
  section: z.string().max(200).nullish(),
  label: z.string().min(1).max(200),
  kind: z.enum(["card", "slide"]).default("card"),
  imageUrl: httpsUrl.nullish(),
  url: httpsUrl.nullish(),
}).refine((d) => d.imageUrl || d.url, "imageUrl or url required");
export const sectionReadyData = z.object({
  projectId: z.string().min(1).max(128),
  section: z.string().min(1).max(200),
  prompt: z.string().max(2000).nullish(),
});
export const previewData = z.object({
  projectId: z.string().min(1).max(128),
  previewUrl: httpsUrl,
});

export const INBOUND_EVENT_TYPES = [
  "project.upserted",
  "message.created",
  "sketch.created",
  "section.ready",
  "preview.updated",
] as const;
export type InboundEventType = (typeof INBOUND_EVENT_TYPES)[number];

export const inboundEventSchema = z.discriminatedUnion("type", [
  inboundEnvelope("project.upserted", projectUpsertData),
  inboundEnvelope("message.created", messageData),
  inboundEnvelope("sketch.created", sketchData),
  inboundEnvelope("section.ready", sectionReadyData),
  inboundEnvelope("preview.updated", previewData),
]);
export type InboundEvent = z.infer<typeof inboundEventSchema>;

/* ---------- Outbound (dashboard -> Daisy) ---------- */
export const OUTBOUND_EVENT_TYPES = [
  "owner.message",
  "owner.sketch_chosen",
  "owner.comment",
  "owner.gate_submitted", // references and/or notes
  "owner.gate_continued", // plain Continue
] as const;
export type OutboundEventType = (typeof OUTBOUND_EVENT_TYPES)[number];

export type OutboundPayloads = {
  "owner.message": { projectId: string; messageId: string; body: string };
  "owner.sketch_chosen": { projectId: string; sketchId: string; groupId: string | null; rejectedSketchIds: string[] };
  "owner.comment": { projectId: string; sketchId: string; commentId: string; body: string; x: number | null; y: number | null };
  "owner.gate_submitted": {
    projectId: string; gateId: string; section: string; notes: string | null;
    references: (DaisyReference & { url: string | null })[]; // url = presigned GET (short-lived) when R2 configured
  };
  "owner.gate_continued": { projectId: string; gateId: string; section: string };
};

/** Wire envelope for outbound events (webhook body and pull items). */
export type OutboundEnvelope<T extends OutboundEventType = OutboundEventType> = {
  id: string;
  seq: number;
  type: T;
  createdAt: string; // ISO
  data: OutboundPayloads[T];
};

/* ---------- Signing headers (both directions) ---------- */
export const DAISY_SIGNATURE_HEADER = "x-daisy-signature"; // "v1=<hex hmac-sha256>"
export const DAISY_TIMESTAMP_HEADER = "x-daisy-timestamp"; // unix seconds
export const DAISY_EVENT_ID_HEADER = "x-daisy-event-id";
export const DAISY_MAX_SKEW_SECONDS = 300;
