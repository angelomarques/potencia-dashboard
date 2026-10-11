import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

// Create in-memory SQLite database
let db: DatabaseSync;

function initDb() {
  db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daisy_projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      preview_url TEXT,
      current_section TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daisy_sketches (
      id TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
      group_id TEXT,
      section TEXT,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'card',
      image_url TEXT,
      url TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, id)
    );

    CREATE TABLE IF NOT EXISTS daisy_events (
      id TEXT PRIMARY KEY NOT NULL,
      direction TEXT NOT NULL,
      type TEXT NOT NULL,
      project_id TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      delivered_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS daisy_comments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES daisy_projects(id) ON DELETE CASCADE,
      sketch_id TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'owner',
      body TEXT NOT NULL,
      x REAL,
      y REAL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id, sketch_id) REFERENCES daisy_sketches(project_id, id) ON DELETE CASCADE
    );
  `);
}

// Mock d1Query using in-memory db
vi.mock("@/lib/db/d1-http", () => {
  return {
    d1Query: async (sql: string, params: unknown[] = []) => {
      const st = db.prepare(sql);
      const p = params.map((v) =>
        typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v
      );
      if (st.columns().length > 0) {
        return { results: st.all(...p), meta: { changes: 0 } };
      }
      const r = st.run(...p);
      return {
        results: [],
        meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
      };
    },
    d1Batch: async (statements: { sql: string; params?: unknown[] }[]) => {
      for (const s of statements) {
        const st = db.prepare(s.sql);
        const p = (s.params ?? []).map((v) =>
          typeof v === "boolean" ? (v ? 1 : 0) : v === undefined ? null : v
        );
        st.run(...p);
      }
    },
  };
});

import {
  addSketch,
  getSketch,
  upsertProject,
  DaisySketchConflictError,
} from "../repo";
import { handleInboundRequest } from "../inbound";
import { signDaisyPayload } from "../signing";
import {
  ownerCommentPayloadSchema,
  DAISY_EVENT_ID_HEADER,
  DAISY_SIGNATURE_HEADER,
  DAISY_TIMESTAMP_HEADER,
} from "../types";

describe("Daisy Sketch Scope & Conflict Handling", () => {
  const secret = "test-scope-secret-123456";

  beforeEach(() => {
    initDb();
  });

  it("cross-project: same sketchId in different projects both succeed", async () => {
    // 1. Create two separate projects
    await upsertProject({
      id: "project-alpha",
      name: "Project Alpha",
      status: "active",
    });
    await upsertProject({
      id: "project-beta",
      name: "Project Beta",
      status: "active",
    });

    const commonSketchId = "sketch-shared-hero";

    // 2. Add sketch with identical sketchId to Project Alpha
    const sketchAlpha = await addSketch({
      id: commonSketchId,
      projectId: "project-alpha",
      label: "Hero Alpha",
      kind: "card",
      imageUrl: "https://example.com/alpha.png",
    });
    expect(sketchAlpha.id).toBe(commonSketchId);
    expect(sketchAlpha.projectId).toBe("project-alpha");

    // 3. Add sketch with identical sketchId to Project Beta
    const sketchBeta = await addSketch({
      id: commonSketchId,
      projectId: "project-beta",
      label: "Hero Beta",
      kind: "slide",
      imageUrl: "https://example.com/beta.png",
    });
    expect(sketchBeta.id).toBe(commonSketchId);
    expect(sketchBeta.projectId).toBe("project-beta");

    // 4. Verify each project returns its own scoped sketch
    const retrievedAlpha = await getSketch(commonSketchId, "project-alpha");
    const retrievedBeta = await getSketch(commonSketchId, "project-beta");

    expect(retrievedAlpha).not.toBeNull();
    expect(retrievedAlpha?.label).toBe("Hero Alpha");
    expect(retrievedBeta).not.toBeNull();
    expect(retrievedBeta?.label).toBe("Hero Beta");
  });

  it("deduplication: same event id replay returns 200 duplicate: true", async () => {
    await upsertProject({
      id: "project-dedupe",
      name: "Project Dedupe",
      status: "active",
    });

    const eventId = "evt_dedupe_123456";
    const payload = {
      id: eventId,
      type: "sketch.created",
      data: {
        projectId: "project-dedupe",
        sketchId: "sketch-dedupe-1",
        label: "Dedupe Hero",
        kind: "card",
        imageUrl: "https://example.com/dedupe.png",
      },
    };

    const rawBody = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const signature = signDaisyPayload(secret, String(ts), rawBody);

    const makeRequest = () =>
      new Request("http://localhost:3000/api/daisy/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [DAISY_EVENT_ID_HEADER]: eventId,
          [DAISY_TIMESTAMP_HEADER]: String(ts),
          [DAISY_SIGNATURE_HEADER]: signature,
        },
        body: rawBody,
      });

    // First arrival
    const res1 = await handleInboundRequest(makeRequest(), {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.ok).toBe(true);
    expect(json1.duplicate).toBeUndefined();

    // Replay of same event id
    const res2 = await handleInboundRequest(makeRequest(), {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);
    expect(json2.duplicate).toBe(true);
  });

  it("true conflict: different event with duplicate (project, sketchId) throws DaisySketchConflictError mapped to HTTP 409", async () => {
    await upsertProject({
      id: "project-conflict",
      name: "Project Conflict",
      status: "active",
    });

    // 1. First event adds sketch-conflict-1
    const event1 = {
      id: "evt_sketch_initial_001",
      type: "sketch.created",
      data: {
        projectId: "project-conflict",
        sketchId: "sketch-conflict-1",
        label: "Initial Version",
        kind: "card",
        imageUrl: "https://example.com/initial.png",
      },
    };

    const raw1 = JSON.stringify(event1);
    const ts1 = Math.floor(Date.now() / 1000);
    const sig1 = signDaisyPayload(secret, String(ts1), raw1);

    const req1 = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: event1.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts1),
        [DAISY_SIGNATURE_HEADER]: sig1,
      },
      body: raw1,
    });

    const res1 = await handleInboundRequest(req1, {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res1.status).toBe(200);

    // 2. Direct repo call with same (project, sketchId) throws typed DaisySketchConflictError
    await expect(
      addSketch({
        id: "sketch-conflict-1",
        projectId: "project-conflict",
        label: "Colliding direct sketch",
        kind: "card",
        imageUrl: "https://example.com/collide.png",
      })
    ).rejects.toThrow(DaisySketchConflictError);

    // 3. Second event has a NEW event ID, but targets the existing (projectId, sketchId)
    const event2 = {
      id: "evt_sketch_duplicate_002",
      type: "sketch.created",
      data: {
        projectId: "project-conflict",
        sketchId: "sketch-conflict-1",
        label: "Colliding Version",
        kind: "card",
        imageUrl: "https://example.com/collide.png",
      },
    };

    const raw2 = JSON.stringify(event2);
    const ts2 = Math.floor(Date.now() / 1000);
    const sig2 = signDaisyPayload(secret, String(ts2), raw2);

    const req2 = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: event2.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts2),
        [DAISY_SIGNATURE_HEADER]: sig2,
      },
      body: raw2,
    });

    const res2 = await handleInboundRequest(req2, {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res2.status).toBe(409);
    const json2 = await res2.json();
    expect(json2).toEqual({ error: "sketch_conflict" });
  });

  describe("owner.comment payload schema", () => {
    it("accepts null x and y coordinates", () => {
      const parsed = ownerCommentPayloadSchema.safeParse({
        projectId: "proj-1",
        sketchId: "sketch-1",
        commentId: "comm-1",
        body: "Unpinned slide feedback",
        x: null,
        y: null,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.x).toBeNull();
        expect(parsed.data.y).toBeNull();
      }
    });

    it("accepts pinned numeric x and y coordinates between 0 and 1", () => {
      const parsed = ownerCommentPayloadSchema.safeParse({
        projectId: "proj-1",
        sketchId: "sketch-1",
        commentId: "comm-2",
        body: "Pinned button tweak",
        x: 0.45,
        y: 0.85,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.x).toBe(0.45);
        expect(parsed.data.y).toBe(0.85);
      }
    });

    it("rejects coordinates outside 0..1 range", () => {
      const tooHigh = ownerCommentPayloadSchema.safeParse({
        projectId: "proj-1",
        sketchId: "sketch-1",
        commentId: "comm-3",
        body: "Out of bounds",
        x: 1.05,
        y: 0.5,
      });
      expect(tooHigh.success).toBe(false);

      const negative = ownerCommentPayloadSchema.safeParse({
        projectId: "proj-1",
        sketchId: "sketch-1",
        commentId: "comm-4",
        body: "Negative coordinate",
        x: 0.5,
        y: -0.01,
      });
      expect(negative.success).toBe(false);
    });

    it("rejects empty body", () => {
      const emptyBody = ownerCommentPayloadSchema.safeParse({
        projectId: "proj-1",
        sketchId: "sketch-1",
        commentId: "comm-5",
        body: "",
        x: null,
        y: null,
      });
      expect(emptyBody.success).toBe(false);
    });
  });
});
