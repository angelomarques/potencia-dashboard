import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error node:sqlite is built-in in Node 22, types missing in @types/node 20
import { DatabaseSync } from "node:sqlite";

// Create in-memory SQLite database
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

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

  it("cross-project same sketchId creates separate sketches", async () => {
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

  it("same event id replay dedupes", async () => {
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

  it("same-project upsert updates fields", async () => {
    await upsertProject({
      id: "project-upsert",
      name: "Project Upsert",
      status: "active",
    });

    const sketchId = "sketch-upsert-1";

    // 1. Initial sketch.created event
    const event1 = {
      id: "evt_sketch_created_001",
      type: "sketch.created",
      data: {
        projectId: "project-upsert",
        sketchId,
        label: "Initial Version",
        kind: "card",
        imageUrl: "https://example.com/initial.png",
        section: "Hero",
        groupId: "group-init",
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
    const json1 = await res1.json();
    expect(json1.ok).toBe(true);

    const sketch1 = await getSketch(sketchId, "project-upsert");
    expect(sketch1).not.toBeNull();
    expect(sketch1?.label).toBe("Initial Version");
    expect(sketch1?.imageUrl).toBe("https://example.com/initial.png");
    expect(sketch1?.url).toBeNull();
    expect(sketch1?.section).toBe("Hero");
    expect(sketch1?.groupId).toBe("group-init");
    expect(sketch1?.kind).toBe("card");
    expect(sketch1?.status).toBe("proposed");
    const initialCreatedAt = sketch1?.createdAt;

    // 2. NEW event id with existing sketchId updates label, imageUrl, url (and never returns 500)
    const event2 = {
      id: "evt_sketch_created_002",
      type: "sketch.created",
      data: {
        projectId: "project-upsert",
        sketchId,
        label: "Updated Label",
        imageUrl: "https://example.com/updated.png",
        url: "https://example.com/sketch-page",
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
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);

    const sketch2 = await getSketch(sketchId, "project-upsert");
    expect(sketch2).not.toBeNull();
    expect(sketch2?.label).toBe("Updated Label");
    expect(sketch2?.imageUrl).toBe("https://example.com/updated.png");
    expect(sketch2?.url).toBe("https://example.com/sketch-page");
    // Preserved because not provided
    expect(sketch2?.section).toBe("Hero");
    expect(sketch2?.groupId).toBe("group-init");
    expect(sketch2?.kind).toBe("card");
    expect(sketch2?.status).toBe("proposed");
    expect(sketch2?.createdAt).toBe(initialCreatedAt);

    // 3. NEW event id providing section, groupId, kind updates them
    const event3 = {
      id: "evt_sketch_created_003",
      type: "sketch.created",
      data: {
        projectId: "project-upsert",
        sketchId,
        label: "Third Label",
        imageUrl: "https://example.com/third.png",
        section: "Features",
        groupId: "group-updated",
        kind: "slide",
      },
    };

    const raw3 = JSON.stringify(event3);
    const ts3 = Math.floor(Date.now() / 1000);
    const sig3 = signDaisyPayload(secret, String(ts3), raw3);

    const req3 = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: event3.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts3),
        [DAISY_SIGNATURE_HEADER]: sig3,
      },
      body: raw3,
    });

    const res3 = await handleInboundRequest(req3, {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res3.status).toBe(200);
    const json3 = await res3.json();
    expect(json3.ok).toBe(true);

    const sketch3 = await getSketch(sketchId, "project-upsert");
    expect(sketch3?.label).toBe("Third Label");
    expect(sketch3?.imageUrl).toBe("https://example.com/third.png");
    expect(sketch3?.section).toBe("Features");
    expect(sketch3?.groupId).toBe("group-updated");
    expect(sketch3?.kind).toBe("slide");
    expect(sketch3?.createdAt).toBe(initialCreatedAt);
  });

  it("sketch.updated works", async () => {
    await upsertProject({
      id: "project-sketch-updated",
      name: "Project Sketch Updated",
      status: "active",
    });

    const sketchId = "sketch-update-test";

    // 1. Initial sketch creation
    const event1 = {
      id: "evt_initial_before_update",
      type: "sketch.created",
      data: {
        projectId: "project-sketch-updated",
        sketchId,
        label: "Initial For Update",
        kind: "card",
        imageUrl: "https://example.com/before.png",
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

    // 2. Dispatch sketch.updated inbound event
    const event2 = {
      id: "evt_sketch_updated_001",
      type: "sketch.updated",
      data: {
        projectId: "project-sketch-updated",
        sketchId,
        label: "Updated Via sketch.updated",
        imageUrl: "https://example.com/after.png",
        url: "https://example.com/sketch-page",
        kind: "slide",
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
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);
    expect(json2.type).toBe("sketch.updated");

    const updatedSketch = await getSketch(sketchId, "project-sketch-updated");
    expect(updatedSketch?.label).toBe("Updated Via sketch.updated");
    expect(updatedSketch?.imageUrl).toBe("https://example.com/after.png");
    expect(updatedSketch?.url).toBe("https://example.com/sketch-page");
    expect(updatedSketch?.kind).toBe("slide");

    // 3. sketch.updated on new sketch also creates it (upsert semantics)
    const newSketchId = "sketch-created-by-update";
    const event3 = {
      id: "evt_sketch_updated_002",
      type: "sketch.updated",
      data: {
        projectId: "project-sketch-updated",
        sketchId: newSketchId,
        label: "Created By Update",
        imageUrl: "https://example.com/brand-new.png",
      },
    };

    const raw3 = JSON.stringify(event3);
    const ts3 = Math.floor(Date.now() / 1000);
    const sig3 = signDaisyPayload(secret, String(ts3), raw3);

    const req3 = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: event3.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts3),
        [DAISY_SIGNATURE_HEADER]: sig3,
      },
      body: raw3,
    });

    const res3 = await handleInboundRequest(req3, {
      deps: { getWebhookSecret: () => secret },
    });
    expect(res3.status).toBe(200);
    const createdByUpdate = await getSketch(newSketchId, "project-sketch-updated");
    expect(createdByUpdate?.label).toBe("Created By Update");
  });

  it("error mapping -> 409/500 JSON", async () => {
    await upsertProject({
      id: "project-error-test",
      name: "Project Error Test",
      status: "active",
    });

    const conflictPayload = {
      id: "evt_conflict_mapping",
      type: "sketch.created",
      data: {
        projectId: "project-error-test",
        sketchId: "sk-conflict",
        label: "Conflict Sketch",
        imageUrl: "https://example.com/conflict.png",
      },
    };

    const rawConflict = JSON.stringify(conflictPayload);
    const ts = Math.floor(Date.now() / 1000);
    const sigConflict = signDaisyPayload(secret, String(ts), rawConflict);

    const reqConflict = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: conflictPayload.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts),
        [DAISY_SIGNATURE_HEADER]: sigConflict,
      },
      body: rawConflict,
    });

    // 1. Genuine sketch conflict maps to HTTP 409 JSON { error: "sketch_conflict" }
    const resConflict = await handleInboundRequest(reqConflict, {
      deps: {
        getWebhookSecret: () => secret,
        addSketch: async () => {
          throw new DaisySketchConflictError("Simulated genuine conflict");
        },
      },
    });
    expect(resConflict.status).toBe(409);
    const jsonConflict = await resConflict.json();
    expect(jsonConflict).toEqual({ error: "sketch_conflict" });

    // 2. Unexpected error maps to HTTP 500 JSON { error: "internal_error" }
    const errorPayload = {
      id: "evt_internal_error_mapping",
      type: "sketch.created",
      data: {
        projectId: "project-error-test",
        sketchId: "sk-internal-error",
        label: "Internal Error Sketch",
        imageUrl: "https://example.com/error.png",
      },
    };

    const rawError = JSON.stringify(errorPayload);
    const sigError = signDaisyPayload(secret, String(ts), rawError);

    const reqError = new Request("http://localhost:3000/api/daisy/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [DAISY_EVENT_ID_HEADER]: errorPayload.id,
        [DAISY_TIMESTAMP_HEADER]: String(ts),
        [DAISY_SIGNATURE_HEADER]: sigError,
      },
      body: rawError,
    });

    const resError = await handleInboundRequest(reqError, {
      deps: {
        getWebhookSecret: () => secret,
        addSketch: async () => {
          throw new Error("Unexpected database disk explosion");
        },
      },
    });
    expect(resError.status).toBe(500);
    const jsonError = await resError.json();
    expect(jsonError).toEqual({ error: "internal_error" });

    // 3. Typed route returns JSON 404 for unknown type, and JSON 409 on conflict
    const { POST: typedPOST } = await import(
      "@/app/api/daisy/webhooks/[type]/route"
    );

    const unknownReq = new Request("http://localhost:3000/api/daisy/webhooks/unknown", {
      method: "POST",
    });
    const resUnknown = await typedPOST(unknownReq, {
      params: Promise.resolve({ type: "unknown" }),
    });
    expect(resUnknown.status).toBe(404);
    expect(await resUnknown.json()).toEqual({ error: "unknown_webhook_type" });
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
