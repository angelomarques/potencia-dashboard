/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboundRequest, type DaisyInboundDeps } from "../inbound";
import { signDaisyPayload, verifyDaisySignature } from "../signing";
import {
  DAISY_EVENT_ID_HEADER,
  DAISY_SIGNATURE_HEADER,
  DAISY_TIMESTAMP_HEADER,
  type DaisyProject,
} from "../types";

describe("Daisy Inbound Webhooks", () => {
  const secret = "test-webhook-secret-key-123";
  const fixedNow = 1700000000; // unix seconds

  let recordedEvents: Set<string>;
  let projects: Map<string, DaisyProject>;
  let messages: any[];
  let sketches: any[];
  let gates: any[];
  let previewUrls: Map<string, string | null>;
  let mockDeps: DaisyInboundDeps;

  beforeEach(() => {
    recordedEvents = new Set();
    projects = new Map();
    messages = [];
    sketches = [];
    gates = [];
    previewUrls = new Map();

    mockDeps = {
      getWebhookSecret: () => secret,
      rateLimit: async () => ({ ok: true }),
      verifySignature: verifyDaisySignature,
      recordInboundEventOnce: async ({ id }) => {
        if (recordedEvents.has(id)) {
          return false;
        }
        recordedEvents.add(id);
        return true;
      },
      getProject: async (id) => projects.get(id) || null,
      upsertProject: async (input) => {
        const proj: DaisyProject = {
          id: input.id,
          name: input.name,
          status: input.status,
          summary: input.summary ?? null,
          currentSection: input.currentSection ?? null,
          previewUrl: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastActivityAt: Date.now(),
        };
        projects.set(input.id, proj);
        return proj;
      },
      addMessage: async (input) => {
        const msg = {
          id: input.id || "msg-generated",
          projectId: input.projectId,
          author: input.author,
          body: input.body,
          createdAt: Date.now(),
        };
        messages.push(msg);
        return msg;
      },
      addSketch: async (input) => {
        const sketch = {
          ...input,
          status: "proposed" as const,
          createdAt: Date.now(),
        };
        sketches.push(sketch);
        return sketch;
      },
      openGate: async (input) => {
        const gate = {
          id: "gate-1",
          projectId: input.projectId,
          section: input.section,
          prompt: input.prompt ?? null,
          status: "open" as const,
          notes: null,
          references: [],
          createdAt: Date.now(),
          resolvedAt: null,
        };
        gates.push(gate);
        return gate;
      },
      setPreviewUrl: async (projectId, url) => {
        previewUrls.set(projectId, url);
      },
      isAllowedPreviewUrl: (url) => {
        if (!url) return false;
        return (
          url.startsWith("https://allowed.vercel.app") ||
          url.startsWith("https://potenciaapps.com.br")
        );
      },
      now: () => fixedNow,
    };
  });

  function makeRequest({
    body,
    timestamp = String(fixedNow),
    signature,
    eventId,
    headers = {},
    rawBodyOverride,
  }: {
    body?: any;
    timestamp?: string | null;
    signature?: string | null;
    eventId?: string | null;
    headers?: Record<string, string>;
    rawBodyOverride?: string;
  }) {
    const rawBody =
      rawBodyOverride !== undefined
        ? rawBodyOverride
        : JSON.stringify(body ?? {});

    const sig =
      signature !== undefined
        ? signature
        : timestamp !== null
        ? signDaisyPayload(secret, timestamp, rawBody)
        : null;

    const reqHeaders = new Headers({
      "content-type": "application/json",
      "x-forwarded-for": "192.168.1.1",
      ...headers,
    });

    if (timestamp !== null) {
      reqHeaders.set(DAISY_TIMESTAMP_HEADER, timestamp);
    }
    if (sig !== null) {
      reqHeaders.set(DAISY_SIGNATURE_HEADER, sig);
    }
    if (eventId !== null && eventId !== undefined) {
      reqHeaders.set(DAISY_EVENT_ID_HEADER, eventId);
    }

    return new Request("https://example.com/api/daisy/webhooks", {
      method: "POST",
      headers: reqHeaders,
      body: rawBody,
    });
  }

  it("signature accept - applies valid event and returns 200", async () => {
    const event = {
      id: "evt-project-upsert-1",
      type: "project.upserted",
      data: {
        projectId: "proj-1",
        name: "Dashboard Redesign",
        status: "active",
        summary: "Project summary here",
      },
    };

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      id: "evt-project-upsert-1",
      type: "project.upserted",
    });

    expect(projects.has("proj-1")).toBe(true);
    expect(projects.get("proj-1")?.name).toBe("Dashboard Redesign");
  });

  it("bad signature 401 - returns 401 with bad_signature code", async () => {
    const event = {
      id: "evt-bad-sig-1",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };

    const req = makeRequest({
      body: event,
      signature: "v1=" + "a".repeat(64),
    });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "bad_signature" });
  });

  it("stale timestamp 401 (past) - returns 401 with stale_timestamp", async () => {
    const event = {
      id: "evt-stale-past-1",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };
    const staleTime = String(fixedNow - 301);

    const req = makeRequest({ body: event, timestamp: staleTime });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "stale_timestamp" });
  });

  it("stale timestamp 401 (future) - returns 401 with stale_timestamp", async () => {
    const event = {
      id: "evt-stale-future-1",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };
    const futureTime = String(fixedNow + 301);

    const req = makeRequest({ body: event, timestamp: futureTime });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "stale_timestamp" });
  });

  it("missing headers - returns 401 with missing_signature", async () => {
    const event = {
      id: "evt-no-sig",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };

    const req = makeRequest({ body: event, signature: null });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "missing_signature" });
  });

  it("replay of same event id -> duplicate:true and applied once", async () => {
    const event = {
      id: "evt-replay-test",
      type: "message.created",
      data: {
        projectId: "proj-2",
        messageId: "msg-123",
        body: "Hello Daisy!",
      },
    };

    // First request
    const req1 = makeRequest({ body: event, eventId: event.id });
    const res1 = await handleInboundRequest(req1, { deps: mockDeps });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1).toEqual({
      ok: true,
      id: "evt-replay-test",
      type: "message.created",
    });
    expect(messages.length).toBe(1);

    // Second request (replay)
    const req2 = makeRequest({ body: event, eventId: event.id });
    const res2 = await handleInboundRequest(req2, { deps: mockDeps });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2).toEqual({ ok: true, duplicate: true });
    // Message should NOT have been added again
    expect(messages.length).toBe(1);
  });

  it("preview with disallowed origin -> 422 preview_origin_not_allowed (checked BEFORE recording)", async () => {
    const recordSpy = vi.fn(mockDeps.recordInboundEventOnce);
    mockDeps.recordInboundEventOnce = recordSpy;

    const event = {
      id: "evt-preview-bad-origin",
      type: "preview.updated",
      data: {
        projectId: "proj-3",
        previewUrl: "https://evil-attacker-site.com/preview",
      },
    };

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data).toEqual({ error: "preview_origin_not_allowed" });
    // Crucial check: event must NOT have been recorded
    expect(recordSpy).not.toHaveBeenCalled();
    expect(previewUrls.has("proj-3")).toBe(false);
  });

  it("preview with allowed origin -> 200 and sets preview URL", async () => {
    const event = {
      id: "evt-preview-ok",
      type: "preview.updated",
      data: {
        projectId: "proj-4",
        previewUrl: "https://allowed.vercel.app/demo",
      },
    };

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      id: "evt-preview-ok",
      type: "preview.updated",
    });
    expect(previewUrls.get("proj-4")).toBe("https://allowed.vercel.app/demo");
  });

  it("invalid payload -> 422 with invalid_payload and issues", async () => {
    const event = {
      id: "evt-invalid-payload",
      type: "sketch.created",
      data: {
        // Missing label and imageUrl/url
        projectId: "proj-5",
        sketchId: "sk-1",
      },
    };

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("invalid_payload");
    expect(Array.isArray(data.issues)).toBe(true);
    expect(data.issues.length).toBeGreaterThan(0);
  });

  it("type mismatch -> 422 when expectedType does not match", async () => {
    const event = {
      id: "evt-type-mismatch",
      type: "message.created",
      data: {
        projectId: "proj-6",
        body: "Hello",
      },
    };

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, {
      expectedType: "sketch.created",
      deps: mockDeps,
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data).toEqual({ error: "type_mismatch" });
  });

  it("event id mismatch -> 400 when x-daisy-event-id differs from body.id", async () => {
    const event = {
      id: "evt-body-id-12345",
      type: "section.ready",
      data: {
        projectId: "proj-7",
        section: "hero",
      },
    };

    const req = makeRequest({
      body: event,
      eventId: "evt-header-different-id",
    });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "event_id_mismatch" });
  });

  it("invalid JSON -> 400 invalid_json", async () => {
    const req = makeRequest({ rawBodyOverride: "{ not valid json }" });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: "invalid_json" });
  });

  it("missing secret -> 503 daisy_not_configured", async () => {
    const event = {
      id: "evt-no-secret-1234",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };

    const req = makeRequest({ body: event });
    const res = await handleInboundRequest(req, {
      deps: { ...mockDeps, getWebhookSecret: () => undefined },
    });

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data).toEqual({ error: "daisy_not_configured" });
  });

  it("rate limited -> 429 with Retry-After header", async () => {
    const event = {
      id: "evt-rl-12345678",
      type: "project.upserted",
      data: { projectId: "proj-1", name: "P1" },
    };

    const req = makeRequest({ body: event });
    const res = await handleInboundRequest(req, {
      deps: {
        ...mockDeps,
        rateLimit: async () => ({ ok: false, retryAfter: 30 }),
      },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const data = await res.json();
    expect(data).toEqual({ error: "rate_limited" });
  });

  it("payload too large -> 413 payload_too_large", async () => {
    const largeBody = "x".repeat(256 * 1024 + 1);
    const req = makeRequest({ rawBodyOverride: largeBody });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data).toEqual({ error: "payload_too_large" });
  });

  it("auto-creates project if project unknown for message/sketch/section/preview", async () => {
    const event = {
      id: "evt-auto-create-1",
      type: "sketch.created",
      data: {
        projectId: "unknown-project-99",
        sketchId: "sk-99",
        label: "Option A",
        kind: "card" as const,
        url: "https://allowed.vercel.app/sketch-99",
      },
    };

    expect(projects.has("unknown-project-99")).toBe(false);

    const req = makeRequest({ body: event, eventId: event.id });
    const res = await handleInboundRequest(req, { deps: mockDeps });

    expect(res.status).toBe(200);
    expect(projects.has("unknown-project-99")).toBe(true);
    expect(projects.get("unknown-project-99")?.name).toBe("unknown-project-99");
    expect(sketches.length).toBe(1);
    expect(sketches[0].id).toBe("sk-99");
  });

  describe("daisyRateLimit in-memory fallback", () => {
    it("enforces limits per kind and calculates retryAfter", async () => {
      const { daisyRateLimit, clearMemoryRateLimits } = await import(
        "../ratelimit"
      );
      clearMemoryRateLimits();

      const testKey = "test-client-ip-fallback";

      // 'pull' limit is 60/min
      for (let i = 0; i < 60; i++) {
        const res = await daisyRateLimit(testKey, "pull");
        expect(res.ok).toBe(true);
      }

      // 61st request should be rejected
      const blocked = await daisyRateLimit(testKey, "pull");
      expect(blocked.ok).toBe(false);
      expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);

      // 'inbound' kind with the same key should still be allowed (separate buckets)
      const inboundRes = await daisyRateLimit(testKey, "inbound");
      expect(inboundRes.ok).toBe(true);
    });
  });

  describe("Webhook route handlers", () => {
    it("generic route calls handleInboundRequest", async () => {
      const { POST } = await import(
        "@/app/api/daisy/webhooks/route"
      );
      const event = {
        id: "evt-route-generic",
        type: "project.upserted",
        data: { projectId: "proj-route-1", name: "Route Test" },
      };
      // Test when secret not set or with request
      const req = makeRequest({ body: event, eventId: event.id });
      const res = await POST(req);
      // Secret is not in env or mock, so response is 503 or 200
      expect([200, 503]).toContain(res.status);
    });

    it("typed route returns 404 for unknown type param", async () => {
      const { POST: typedPOST } = await import(
        "@/app/api/daisy/webhooks/[type]/route"
      );
      const req = new Request("https://example.com/api/daisy/webhooks/unknown", {
        method: "POST",
      });
      const res = await typedPOST(req, {
        params: Promise.resolve({ type: "unknown" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: "unknown_webhook_type" });
    });
  });
});
