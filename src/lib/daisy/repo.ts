import "server-only";
import { d1Query } from "@/lib/db/d1-http";
import type {
  DaisyComment,
  DaisyEvent,
  DaisyEventDirection,
  DaisyGate,
  DaisyGateStatus,
  DaisyMessage,
  DaisyMessageAuthor,
  DaisyProject,
  DaisyProjectStatus,
  DaisyReference,
  DaisySketch,
  DaisySketchKind,
  DaisySketchStatus,
  DaisyThreadItem,
  OutboundEventType,
} from "./types";

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  summary: string | null;
  preview_url: string | null;
  current_section: string | null;
  created_at: number;
  updated_at: number;
  last_activity_at: number;
};

type MessageRow = {
  id: string;
  project_id: string;
  author: string;
  body: string;
  created_at: number;
};

type SketchRow = {
  id: string;
  project_id: string;
  group_id: string | null;
  section: string | null;
  label: string;
  kind: string;
  image_url: string | null;
  url: string | null;
  status: string;
  created_at: number;
};

type CommentRow = {
  id: string;
  project_id: string;
  sketch_id: string;
  body: string;
  x: number | null;
  y: number | null;
  created_at: number;
};

type GateRow = {
  id: string;
  project_id: string;
  section: string;
  prompt: string | null;
  status: string;
  notes: string | null;
  references_json: string | null;
  created_at: number;
  resolved_at: number | null;
};

type EventRow = {
  seq: number;
  id: string;
  direction: string;
  type: string;
  project_id: string | null;
  payload_json: string | null;
  status: string;
  attempts: number;
  next_attempt_at: number | null;
  last_error: string | null;
  created_at: number;
  delivered_at: number | null;
};

function mapProject(row: ProjectRow): DaisyProject {
  return {
    id: row.id,
    name: row.name,
    status: row.status as DaisyProjectStatus,
    summary: row.summary ?? null,
    previewUrl: row.preview_url ?? null,
    currentSection: row.current_section ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    lastActivityAt: Number(row.last_activity_at),
  };
}

function mapMessage(row: MessageRow): DaisyMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    author: row.author as DaisyMessageAuthor,
    body: row.body,
    createdAt: Number(row.created_at),
  };
}

function mapSketch(row: SketchRow): DaisySketch {
  return {
    id: row.id,
    projectId: row.project_id,
    groupId: row.group_id ?? null,
    section: row.section ?? null,
    label: row.label,
    kind: row.kind as DaisySketchKind,
    imageUrl: row.image_url ?? null,
    url: row.url ?? null,
    status: row.status as DaisySketchStatus,
    createdAt: Number(row.created_at),
  };
}

function mapComment(row: CommentRow): DaisyComment {
  return {
    id: row.id,
    projectId: row.project_id,
    sketchId: row.sketch_id,
    body: row.body,
    x: row.x != null ? Number(row.x) : null,
    y: row.y != null ? Number(row.y) : null,
    createdAt: Number(row.created_at),
  };
}

function mapGate(row: GateRow): DaisyGate {
  let references: DaisyReference[] = [];
  if (row.references_json) {
    try {
      references = JSON.parse(row.references_json);
    } catch {
      references = [];
    }
  }
  return {
    id: row.id,
    projectId: row.project_id,
    section: row.section,
    prompt: row.prompt ?? null,
    status: row.status as DaisyGateStatus,
    notes: row.notes ?? null,
    references: Array.isArray(references) ? references : [],
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at != null ? Number(row.resolved_at) : null,
  };
}

function mapEvent(row: EventRow): DaisyEvent {
  let payload: unknown = null;
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      payload = row.payload_json;
    }
  }
  return {
    id: row.id,
    seq: Number(row.seq),
    direction: row.direction as DaisyEventDirection,
    type: row.type,
    projectId: row.project_id ?? null,
    payload,
    status: row.status as DaisyEvent["status"],
    attempts: Number(row.attempts),
    nextAttemptAt:
      row.next_attempt_at != null ? Number(row.next_attempt_at) : null,
    lastError: row.last_error ?? null,
    createdAt: Number(row.created_at),
    deliveredAt: row.delivered_at != null ? Number(row.delivered_at) : null,
  };
}

export function daisyStorageConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      process.env.D1_DATABASE_ID?.trim() &&
      process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
}

export async function listProjects(): Promise<DaisyProject[]> {
  const { results } = await d1Query<ProjectRow>(
    `SELECT * FROM daisy_projects ORDER BY last_activity_at DESC`,
  );
  return results.map(mapProject);
}

export async function getProject(id: string): Promise<DaisyProject | null> {
  const { results } = await d1Query<ProjectRow>(
    `SELECT * FROM daisy_projects WHERE id = ? LIMIT 1`,
    [id],
  );
  return results[0] ? mapProject(results[0]) : null;
}

export async function upsertProject(input: {
  id: string;
  name: string;
  status: DaisyProjectStatus;
  summary?: string | null;
  currentSection?: string | null;
}): Promise<DaisyProject> {
  const now = Date.now();
  const hasSummary = input.summary !== undefined ? 1 : 0;
  const hasCurrentSection = input.currentSection !== undefined ? 1 : 0;

  await d1Query(
    `INSERT INTO daisy_projects (
       id, name, status, summary, preview_url, current_section, created_at, updated_at, last_activity_at
     ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       status = excluded.status,
       summary = CASE WHEN ? = 1 THEN excluded.summary ELSE daisy_projects.summary END,
       current_section = CASE WHEN ? = 1 THEN excluded.current_section ELSE daisy_projects.current_section END,
       updated_at = excluded.updated_at,
       last_activity_at = excluded.last_activity_at`,
    [
      input.id,
      input.name,
      input.status,
      input.summary ?? null,
      input.currentSection ?? null,
      now,
      now,
      now,
      hasSummary,
      hasCurrentSection,
    ],
  );

  const project = await getProject(input.id);
  if (!project) throw new Error(`Failed to upsert project: ${input.id}`);
  return project;
}

export async function setPreviewUrl(
  projectId: string,
  url: string | null,
): Promise<void> {
  const now = Date.now();
  await d1Query(
    `UPDATE daisy_projects
     SET preview_url = ?, updated_at = ?, last_activity_at = ?
     WHERE id = ?`,
    [url, now, now, projectId],
  );
}

export async function addMessage(input: {
  id?: string;
  projectId: string;
  author: DaisyMessageAuthor;
  body: string;
}): Promise<DaisyMessage> {
  const id = input.id ?? crypto.randomUUID();
  const now = Date.now();

  await d1Query(
    `INSERT OR IGNORE INTO daisy_messages (id, project_id, author, body, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.projectId, input.author, input.body, now],
  );

  await d1Query(
    `UPDATE daisy_projects
     SET last_activity_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, input.projectId],
  );

  const { results } = await d1Query<MessageRow>(
    `SELECT * FROM daisy_messages WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!results[0]) {
    throw new Error(`Failed to insert or fetch message: ${id}`);
  }
  return mapMessage(results[0]);
}

export async function addSketch(
  input: Omit<DaisySketch, "status" | "createdAt">,
): Promise<DaisySketch> {
  const id = input.id || crypto.randomUUID();
  const now = Date.now();

  await d1Query(
    `INSERT INTO daisy_sketches (
       id, project_id, group_id, section, label, kind, image_url, url, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
    [
      id,
      input.projectId,
      input.groupId ?? null,
      input.section ?? null,
      input.label,
      input.kind,
      input.imageUrl ?? null,
      input.url ?? null,
      now,
    ],
  );

  await d1Query(
    `UPDATE daisy_projects
     SET last_activity_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, input.projectId],
  );

  const sketch = await getSketch(id);
  if (!sketch) throw new Error(`Failed to fetch sketch: ${id}`);
  return sketch;
}

export async function getSketch(id: string): Promise<DaisySketch | null> {
  const { results } = await d1Query<SketchRow>(
    `SELECT * FROM daisy_sketches WHERE id = ? LIMIT 1`,
    [id],
  );
  return results[0] ? mapSketch(results[0]) : null;
}

export async function chooseSketch(
  sketchId: string,
): Promise<{ sketch: DaisySketch; rejectedSketchIds: string[] }> {
  const sketch = await getSketch(sketchId);
  if (!sketch) throw new Error(`Sketch not found: ${sketchId}`);

  let rejectedSketchIds: string[] = [];
  if (sketch.groupId) {
    const { results: others } = await d1Query<{ id: string }>(
      `SELECT id FROM daisy_sketches WHERE group_id = ? AND id != ?`,
      [sketch.groupId, sketchId],
    );
    rejectedSketchIds = others.map((r) => r.id);
    if (rejectedSketchIds.length > 0) {
      await d1Query(
        `UPDATE daisy_sketches SET status = 'rejected' WHERE group_id = ? AND id != ?`,
        [sketch.groupId, sketchId],
      );
    }
  }

  await d1Query(
    `UPDATE daisy_sketches SET status = 'chosen' WHERE id = ?`,
    [sketchId],
  );

  const now = Date.now();
  await d1Query(
    `UPDATE daisy_projects SET last_activity_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, sketch.projectId],
  );

  const updated = await getSketch(sketchId);
  if (!updated) throw new Error(`Failed to load chosen sketch: ${sketchId}`);
  return { sketch: updated, rejectedSketchIds };
}

export async function addComment(input: {
  projectId: string;
  sketchId: string;
  body: string;
  x?: number | null;
  y?: number | null;
}): Promise<DaisyComment> {
  const id = crypto.randomUUID();
  const now = Date.now();

  await d1Query(
    `INSERT INTO daisy_comments (id, project_id, sketch_id, body, x, y, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      input.sketchId,
      input.body,
      input.x ?? null,
      input.y ?? null,
      now,
    ],
  );

  await d1Query(
    `UPDATE daisy_projects SET last_activity_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, input.projectId],
  );

  return {
    id,
    projectId: input.projectId,
    sketchId: input.sketchId,
    body: input.body,
    x: input.x ?? null,
    y: input.y ?? null,
    createdAt: now,
  };
}

export async function listThread(
  projectId: string,
): Promise<DaisyThreadItem[]> {
  const [messagesRes, sketchesRes, commentsRes, gatesRes] = await Promise.all([
    d1Query<MessageRow>(
      `SELECT * FROM daisy_messages WHERE project_id = ? ORDER BY created_at ASC`,
      [projectId],
    ),
    d1Query<SketchRow>(
      `SELECT * FROM daisy_sketches WHERE project_id = ? ORDER BY created_at ASC`,
      [projectId],
    ),
    d1Query<CommentRow>(
      `SELECT * FROM daisy_comments WHERE project_id = ? ORDER BY created_at ASC`,
      [projectId],
    ),
    d1Query<GateRow>(
      `SELECT * FROM daisy_gates WHERE project_id = ? ORDER BY created_at ASC`,
      [projectId],
    ),
  ]);

  const commentsBySketch = new Map<string, DaisyComment[]>();
  for (const c of commentsRes.results.map(mapComment)) {
    const list = commentsBySketch.get(c.sketchId) ?? [];
    list.push(c);
    commentsBySketch.set(c.sketchId, list);
  }

  const items: DaisyThreadItem[] = [];

  for (const msg of messagesRes.results.map(mapMessage)) {
    items.push({
      type: "message",
      at: msg.createdAt,
      message: msg,
    });
  }

  for (const sk of sketchesRes.results.map(mapSketch)) {
    items.push({
      type: "sketch",
      at: sk.createdAt,
      sketch: sk,
      comments: commentsBySketch.get(sk.id) ?? [],
    });
  }

  for (const gate of gatesRes.results.map(mapGate)) {
    items.push({
      type: "gate",
      at: gate.createdAt,
      gate,
    });
  }

  items.sort((a, b) => a.at - b.at);
  return items;
}

export async function openGate(input: {
  projectId: string;
  section: string;
  prompt?: string | null;
}): Promise<DaisyGate> {
  const id = crypto.randomUUID();
  const now = Date.now();

  await d1Query(
    `INSERT INTO daisy_gates (
       id, project_id, section, prompt, status, notes, references_json, created_at, resolved_at
     ) VALUES (?, ?, ?, ?, 'open', NULL, '[]', ?, NULL)`,
    [id, input.projectId, input.section, input.prompt ?? null, now],
  );

  await d1Query(
    `UPDATE daisy_projects
     SET last_activity_at = ?, updated_at = ?, current_section = ?
     WHERE id = ?`,
    [now, now, input.section, input.projectId],
  );

  const gate = await getGate(id);
  if (!gate) throw new Error(`Failed to open gate: ${id}`);
  return gate;
}

export async function getGate(id: string): Promise<DaisyGate | null> {
  const { results } = await d1Query<GateRow>(
    `SELECT * FROM daisy_gates WHERE id = ? LIMIT 1`,
    [id],
  );
  return results[0] ? mapGate(results[0]) : null;
}

export async function getOpenGate(
  projectId: string,
): Promise<DaisyGate | null> {
  const { results } = await d1Query<GateRow>(
    `SELECT * FROM daisy_gates WHERE project_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  );
  return results[0] ? mapGate(results[0]) : null;
}

export async function resolveGate(input: {
  gateId: string;
  status: "continued" | "submitted";
  notes?: string | null;
  references?: DaisyReference[];
}): Promise<DaisyGate> {
  const gate = await getGate(input.gateId);
  if (!gate) throw new Error(`Gate not found: ${input.gateId}`);

  const now = Date.now();
  const references = input.references ?? gate.references ?? [];

  await d1Query(
    `UPDATE daisy_gates
     SET status = ?, notes = ?, references_json = ?, resolved_at = ?
     WHERE id = ?`,
    [
      input.status,
      input.notes ?? null,
      JSON.stringify(references),
      now,
      input.gateId,
    ],
  );

  await d1Query(
    `UPDATE daisy_projects
     SET last_activity_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, gate.projectId],
  );

  const updated = await getGate(input.gateId);
  if (!updated) {
    throw new Error(`Failed to fetch resolved gate: ${input.gateId}`);
  }
  return updated;
}

export async function recordInboundEventOnce(input: {
  id: string;
  type: string;
  projectId: string | null;
  payload: unknown;
}): Promise<boolean> {
  const now = Date.now();

  const res = await d1Query(
    `INSERT OR IGNORE INTO daisy_events (
       id, direction, type, project_id, payload_json, status, attempts, next_attempt_at, last_error, created_at, delivered_at
     ) VALUES (?, 'inbound', ?, ?, ?, 'received', 0, NULL, NULL, ?, NULL)`,
    [
      input.id,
      input.type,
      input.projectId,
      JSON.stringify(input.payload),
      now,
    ],
  );

  const changes = (res.meta as { changes?: number } | undefined)?.changes;
  if (typeof changes === "number") {
    return changes > 0;
  }

  // Fallback: check if the row with this id has created_at === now
  const { results } = await d1Query<{ created_at: number }>(
    `SELECT created_at FROM daisy_events WHERE id = ? LIMIT 1`,
    [input.id],
  );
  if (!results[0]) return false;
  return Number(results[0].created_at) === now;
}

export async function insertOutboundEvent(input: {
  type: OutboundEventType;
  projectId: string | null;
  payload: unknown;
}): Promise<DaisyEvent> {
  const id = crypto.randomUUID();
  const now = Date.now();

  await d1Query(
    `INSERT INTO daisy_events (
       id, direction, type, project_id, payload_json, status, attempts, next_attempt_at, last_error, created_at, delivered_at
     ) VALUES (?, 'outbound', ?, ?, ?, 'pending', 0, NULL, NULL, ?, NULL)`,
    [
      id,
      input.type,
      input.projectId,
      JSON.stringify(input.payload),
      now,
    ],
  );

  const { results } = await d1Query<EventRow>(
    `SELECT * FROM daisy_events WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!results[0]) {
    throw new Error(`Failed to insert or fetch outbound event: ${id}`);
  }
  return mapEvent(results[0]);
}

export async function listOutboundAfter(
  seq: number,
  limit: number,
): Promise<DaisyEvent[]> {
  const { results } = await d1Query<EventRow>(
    `SELECT * FROM daisy_events
     WHERE direction = 'outbound' AND status != 'acked' AND seq > ?
     ORDER BY seq ASC
     LIMIT ?`,
    [seq, limit],
  );
  return results.map(mapEvent);
}

export async function listDueOutbound(
  now: number,
  limit: number,
): Promise<DaisyEvent[]> {
  const { results } = await d1Query<EventRow>(
    `SELECT * FROM daisy_events
     WHERE direction = 'outbound'
       AND status IN ('pending', 'failed')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY seq ASC
     LIMIT ?`,
    [now, limit],
  );
  return results.map(mapEvent);
}

export async function markOutboundDelivered(id: string): Promise<void> {
  const now = Date.now();
  await d1Query(
    `UPDATE daisy_events
     SET status = 'delivered', delivered_at = ?
     WHERE id = ?`,
    [now, id],
  );
}

export async function markOutboundAttempt(
  id: string,
  input: { error: string; nextAttemptAt: number | null; failed: boolean },
): Promise<void> {
  await d1Query(
    `UPDATE daisy_events
     SET attempts = attempts + 1,
         last_error = ?,
         next_attempt_at = ?,
         status = ?
     WHERE id = ?`,
    [
      input.error,
      input.nextAttemptAt,
      input.failed ? "failed" : "pending",
      id,
    ],
  );
}

export async function ackOutboundUpTo(seq: number): Promise<number> {
  const { results } = await d1Query<{ count: number }>(
    `SELECT count(*) as count FROM daisy_events
     WHERE direction = 'outbound' AND seq <= ? AND status != 'acked'`,
    [seq],
  );
  const count = Number(results[0]?.count ?? 0);
  if (count > 0) {
    await d1Query(
      `UPDATE daisy_events
       SET status = 'acked'
       WHERE direction = 'outbound' AND seq <= ? AND status != 'acked'`,
      [seq],
    );
  }
  return count;
}
