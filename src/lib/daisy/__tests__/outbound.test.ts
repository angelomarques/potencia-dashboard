import { describe, expect, it, vi } from "vitest";
import {
  BACKOFF_DELAYS_MS,
  MAX_ATTEMPTS,
  calculateBackoff,
  deliverDueOutbound,
  emitOutbound,
  toEnvelope,
  type OutboundDeps,
} from "../outbound";
import { ackEvents, pullEvents, verifyPullAuth } from "../pull";
import type { DaisyEvent, OutboundPayloads } from "../types";
import { GET as eventsGetHandler } from "@/app/api/daisy/events/route";
import { POST as eventsAckPostHandler } from "@/app/api/daisy/events/ack/route";
import { GET as deliverGetHandler } from "@/app/api/daisy/outbound/deliver/route";
import { env } from "@/env";
import * as repo from "@/lib/daisy/repo";
import * as d1Http from "@/lib/db/d1-http";
import { verifyDaisySignature } from "../signing";

function createMockEvent(overrides: Partial<DaisyEvent> = {}): DaisyEvent {
  return {
    id: "evt_test_123",
    seq: 1,
    direction: "outbound",
    type: "owner.message",
    projectId: "proj_1",
    payload: {
      projectId: "proj_1",
      messageId: "msg_1",
      body: "Test message",
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: 1728590000000,
    deliveredAt: null,
    ...overrides,
  };
}

describe("Outbound Envelope & Backoff", () => {
  it("toEnvelope converts DaisyEvent to OutboundEnvelope with ISO timestamp", () => {
    const event = createMockEvent({
      id: "evt_456",
      seq: 10,
      type: "owner.sketch_chosen",
      createdAt: 1728590000000,
      payload: {
        projectId: "proj_1",
        sketchId: "sk_1",
        groupId: "g_1",
        rejectedSketchIds: ["sk_2"],
      },
    });

    const envelope = toEnvelope(event);
    expect(envelope.id).toBe("evt_456");
    expect(envelope.seq).toBe(10);
    expect(envelope.type).toBe("owner.sketch_chosen");
    expect(envelope.createdAt).toBe(new Date(1728590000000).toISOString());
    expect(envelope.data).toEqual({
      projectId: "proj_1",
      sketchId: "sk_1",
      groupId: "g_1",
      rejectedSketchIds: ["sk_2"],
    });
  });

  it("toEnvelope handles stringified JSON payload", () => {
    const event = createMockEvent({
      payload: JSON.stringify({
        projectId: "p_str",
        messageId: "m_str",
        body: "parsed",
      }),
    });
    const envelope = toEnvelope(event);
    expect(envelope.data).toEqual({
      projectId: "p_str",
      messageId: "m_str",
      body: "parsed",
    });
  });

  it("calculates exponential backoff progression up to MAX_ATTEMPTS", () => {
    const now = 1_000_000;
    // Attempt 1: 30s
    expect(calculateBackoff(1, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[0], // + 30_000
      failed: false,
    });
    // Attempt 2: 2m
    expect(calculateBackoff(2, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[1], // + 120_000
      failed: false,
    });
    // Attempt 3: 10m
    expect(calculateBackoff(3, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[2], // + 600_000
      failed: false,
    });
    // Attempt 4: 30m
    expect(calculateBackoff(4, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[3], // + 1_800_000
      failed: false,
    });
    // Attempt 5: 2h
    expect(calculateBackoff(5, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[4], // + 7_200_000
      failed: false,
    });
    // Attempt 6: 6h
    expect(calculateBackoff(6, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[5], // + 21_600_000
      failed: false,
    });
    // Attempt 7: 12h
    expect(calculateBackoff(7, now)).toEqual({
      nextAttemptAt: now + BACKOFF_DELAYS_MS[6], // + 43_200_000
      failed: false,
    });
    // Attempt 8 (MAX_ATTEMPTS): failed = true, nextAttemptAt = null
    expect(calculateBackoff(8, now)).toEqual({
      nextAttemptAt: null,
      failed: true,
    });
    // Attempt 9 (> MAX_ATTEMPTS): failed = true, nextAttemptAt = null
    expect(calculateBackoff(9, now)).toEqual({
      nextAttemptAt: null,
      failed: true,
    });
  });
});

describe("emitOutbound with Dependency Injection", () => {
  it("stores event and immediately delivers when fetch succeeds (2xx)", async () => {
    const fakeEvent = createMockEvent({ id: "evt_success" });
    const insertMock = vi.fn().mockResolvedValue(fakeEvent);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);
    const attemptMock = vi.fn().mockResolvedValue(undefined);
    const listDueMock = vi.fn().mockResolvedValue([]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    } as unknown as Response);

    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: "sec_test_secret",
      },
      repo: {
        insertOutboundEvent: insertMock,
        listDueOutbound: listDueMock,
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => 1_000_000,
    };

    const payload: OutboundPayloads["owner.message"] = {
      projectId: "proj_1",
      messageId: "msg_1",
      body: "Hello from owner",
    };

    const result = await emitOutbound("owner.message", payload, deps);

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      type: "owner.message",
      projectId: "proj_1",
      payload,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://daisy.example.com/webhook");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers["content-type"]).toBe("application/json");
    expect(calledInit.headers["user-agent"]).toBe("potencia-dashboard-daisy/1");
    expect(calledInit.headers["x-daisy-event-id"]).toBe("evt_success");
    expect(calledInit.headers["x-daisy-signature"]).toMatch(/^v1=[a-f0-9]{64}$/);

    expect(deliveredMock).toHaveBeenCalledWith("evt_success");
    expect(attemptMock).not.toHaveBeenCalled();
    expect(result).toBe(fakeEvent);
  });

  it("schedules retry with backoff on HTTP 500 error and does not throw", async () => {
    const fakeEvent = createMockEvent({ id: "evt_err_500", attempts: 0 });
    const insertMock = vi.fn().mockResolvedValue(fakeEvent);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);
    const attemptMock = vi.fn().mockResolvedValue(undefined);
    const listDueMock = vi.fn().mockResolvedValue([]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as unknown as Response);

    const now = 2_000_000;
    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: "sec_test_secret",
      },
      repo: {
        insertOutboundEvent: insertMock,
        listDueOutbound: listDueMock,
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    };

    await expect(
      emitOutbound(
        "owner.comment",
        {
          projectId: "p1",
          sketchId: "s1",
          commentId: "c1",
          body: "Fix alignment",
          x: 0.5,
          y: 0.5,
        },
        deps
      )
    ).resolves.toBe(fakeEvent);

    expect(deliveredMock).not.toHaveBeenCalled();
    expect(attemptMock).toHaveBeenCalledTimes(1);
    expect(attemptMock).toHaveBeenCalledWith("evt_err_500", {
      error: "HTTP 500 Internal Server Error",
      nextAttemptAt: now + 30_000, // 30s delay for 1st attempt
      failed: false,
    });
  });

  it("schedules retry on network exception without throwing", async () => {
    const fakeEvent = createMockEvent({ id: "evt_net_err" });
    const attemptMock = vi.fn().mockResolvedValue(undefined);

    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: "sec_test_secret",
      },
      repo: {
        insertOutboundEvent: vi.fn().mockResolvedValue(fakeEvent),
        listDueOutbound: vi.fn().mockResolvedValue([]),
        markOutboundDelivered: vi.fn().mockResolvedValue(undefined),
        markOutboundAttempt: attemptMock,
      },
      fetch: vi.fn().mockRejectedValue(new Error("Connection reset")),
      now: () => 1_000_000,
    };

    await expect(
      emitOutbound(
        "owner.gate_continued",
        { projectId: "p1", gateId: "g1", section: "Hero" },
        deps
      )
    ).resolves.toBe(fakeEvent);

    expect(attemptMock).toHaveBeenCalledWith("evt_net_err", {
      error: "Connection reset",
      nextAttemptAt: 1_000_000 + 30_000,
      failed: false,
    });
  });

  it("marks event failed when max attempts (8) are reached", async () => {
    // Event has already experienced 7 failed attempts
    const fakeEvent = createMockEvent({ id: "evt_max_attempt", attempts: 7 });
    const attemptMock = vi.fn().mockResolvedValue(undefined);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      statusText: "Gateway Timeout",
    } as unknown as Response);

    const now = 5_000_000;
    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: "sec_test_secret",
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([fakeEvent]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    };

    const res = await deliverDueOutbound(10, deps);

    expect(res).toEqual({ attempted: 1, delivered: 0 });
    expect(attemptMock).toHaveBeenCalledWith("evt_max_attempt", {
      error: "HTTP 504 Gateway Timeout",
      nextAttemptAt: null,
      failed: true,
    });
    expect(deliveredMock).not.toHaveBeenCalled();
  });
});

describe("deliverDueOutbound", () => {
  it("delivers due events and counts attempted and delivered correctly", async () => {
    const event1 = createMockEvent({ id: "evt_due_1", attempts: 1 });
    const event2 = createMockEvent({ id: "evt_due_2", attempts: 2 });
    const deliveredMock = vi.fn().mockResolvedValue(undefined);
    const attemptMock = vi.fn().mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      if (body.id === "evt_due_1") {
        return { ok: true, status: 200 } as Response;
      }
      return { ok: false, status: 502, statusText: "Bad Gateway" } as Response;
    });

    const now = 10_000_000;
    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: "sec_secret",
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([event1, event2]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    };

    const result = await deliverDueOutbound(50, deps);

    expect(result).toEqual({ attempted: 2, delivered: 1 });
    expect(deliveredMock).toHaveBeenCalledWith("evt_due_1");
    // event2 had attempts: 2 -> next is attempt 3 -> delay index 2 (10m = 600_000)
    expect(attemptMock).toHaveBeenCalledWith("evt_due_2", {
      error: "HTTP 502 Bad Gateway",
      nextAttemptAt: now + 600_000,
      failed: false,
    });
  });

  it("returns zero attempted when DAISY_WEBHOOK_URL is unset", async () => {
    const listDueMock = vi.fn();
    const deps: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: undefined,
        DAISY_WEBHOOK_SECRET: "secret",
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: listDueMock,
        markOutboundDelivered: vi.fn(),
        markOutboundAttempt: vi.fn(),
      },
    };

    const result = await deliverDueOutbound(10, deps);
    expect(result).toEqual({ attempted: 0, delivered: 0 });
    expect(listDueMock).not.toHaveBeenCalled();
  });
});

describe("Outbound Bearer Authentication", () => {
  const secret = "test_webhook_signing_secret_xyz";
  const bearerToken = "daisy_webhook_bearer_token_abc123";

  it("header present with exact value when set in immediate push and retry paths", async () => {
    // 1. Immediate push (emitOutbound)
    const fakeEvent = createMockEvent({ id: "evt_push_bearer" });
    const insertMock = vi.fn().mockResolvedValue(fakeEvent);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);
    const fetchMockImmediate = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    } as unknown as Response);

    const depsImmediate: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: bearerToken,
      },
      repo: {
        insertOutboundEvent: insertMock,
        listDueOutbound: vi.fn().mockResolvedValue([]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: vi.fn(),
      },
      fetch: fetchMockImmediate as unknown as typeof fetch,
    };

    await emitOutbound("owner.message", { projectId: "p1", messageId: "m1", body: "hi" }, depsImmediate);

    expect(fetchMockImmediate).toHaveBeenCalledTimes(1);
    const initImmediate = fetchMockImmediate.mock.calls[0][1];
    expect(initImmediate.headers["authorization"]).toBe(`Bearer ${bearerToken}`);
    expect("authorization" in initImmediate.headers).toBe(true);

    // 2. Retry path (deliverDueOutbound)
    const dueEvent = createMockEvent({ id: "evt_retry_bearer", attempts: 1 });
    const fetchMockRetry = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    } as unknown as Response);

    const depsRetry: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: bearerToken,
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([dueEvent]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: vi.fn(),
      },
      fetch: fetchMockRetry as unknown as typeof fetch,
    };

    const retryResult = await deliverDueOutbound(10, depsRetry);
    expect(retryResult).toEqual({ attempted: 1, delivered: 1 });
    expect(fetchMockRetry).toHaveBeenCalledTimes(1);
    const initRetry = fetchMockRetry.mock.calls[0][1];
    expect(initRetry.headers["authorization"]).toBe(`Bearer ${bearerToken}`);
    expect(initRetry.headers["authorization"]).toBe(`Bearer ${bearerToken}`);
  });

  it("header absent when unset in both immediate push and retry paths", async () => {
    // 1. Immediate push without bearer
    const fakeEvent = createMockEvent({ id: "evt_push_no_bearer" });
    const fetchMockImmediate = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as unknown as Response);

    const depsImmediate: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: undefined,
      },
      repo: {
        insertOutboundEvent: vi.fn().mockResolvedValue(fakeEvent),
        listDueOutbound: vi.fn().mockResolvedValue([]),
        markOutboundDelivered: vi.fn().mockResolvedValue(undefined),
        markOutboundAttempt: vi.fn(),
      },
      fetch: fetchMockImmediate as unknown as typeof fetch,
    };

    await emitOutbound("owner.message", { projectId: "p1", messageId: "m1", body: "hi" }, depsImmediate);

    expect(fetchMockImmediate).toHaveBeenCalledTimes(1);
    const initImmediate = fetchMockImmediate.mock.calls[0][1];
    expect(initImmediate.headers["authorization"]).toBeUndefined();
    expect(initImmediate.headers["authorization"]).toBeUndefined();
    expect("authorization" in initImmediate.headers).toBe(false);
    expect("Authorization" in initImmediate.headers).toBe(false);

    // 2. Retry path without bearer
    const dueEvent = createMockEvent({ id: "evt_retry_no_bearer" });
    const fetchMockRetry = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as unknown as Response);

    const depsRetry: OutboundDeps = {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([dueEvent]),
        markOutboundDelivered: vi.fn().mockResolvedValue(undefined),
        markOutboundAttempt: vi.fn(),
      },
      fetch: fetchMockRetry as unknown as typeof fetch,
    };

    await deliverDueOutbound(10, depsRetry);
    expect(fetchMockRetry).toHaveBeenCalledTimes(1);
    const initRetry = fetchMockRetry.mock.calls[0][1];
    expect(initRetry.headers["authorization"]).toBeUndefined();
    expect(initRetry.headers["authorization"]).toBeUndefined();
    expect("authorization" in initRetry.headers).toBe(false);
    expect("Authorization" in initRetry.headers).toBe(false);
  });

  it("HMAC headers present and signature verifies when bearer is set and when bearer is unset", async () => {
    // Case 1: Bearer set
    const fakeEventWithBearer = createMockEvent({ id: "evt_hmac_with_bearer" });
    const fetchMockWithBearer = vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "with bearer" },
      {
        env: {
          DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
          DAISY_WEBHOOK_SECRET: secret,
          DAISY_WEBHOOK_BEARER: bearerToken,
        },
        repo: {
          insertOutboundEvent: vi.fn().mockResolvedValue(fakeEventWithBearer),
          listDueOutbound: vi.fn().mockResolvedValue([]),
          markOutboundDelivered: vi.fn().mockResolvedValue(undefined),
          markOutboundAttempt: vi.fn(),
        },
        fetch: fetchMockWithBearer as unknown as typeof fetch,
      }
    );

    const initWithBearer = fetchMockWithBearer.mock.calls[0][1];
    expect(initWithBearer.headers["x-daisy-event-id"]).toBe("evt_hmac_with_bearer");
    expect(initWithBearer.headers["x-daisy-timestamp"]).toBeDefined();
    expect(initWithBearer.headers["x-daisy-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(initWithBearer.headers["authorization"]).toBe(`Bearer ${bearerToken}`);

    const verifyResultWithBearer = verifyDaisySignature({
      secret,
      timestamp: initWithBearer.headers["x-daisy-timestamp"],
      signature: initWithBearer.headers["x-daisy-signature"],
      rawBody: initWithBearer.body as string,
    });
    expect(verifyResultWithBearer).toEqual({ ok: true });

    // Case 2: Bearer unset
    const fakeEventWithoutBearer = createMockEvent({ id: "evt_hmac_no_bearer" });
    const fetchMockWithoutBearer = vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "without bearer" },
      {
        env: {
          DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
          DAISY_WEBHOOK_SECRET: secret,
        },
        repo: {
          insertOutboundEvent: vi.fn().mockResolvedValue(fakeEventWithoutBearer),
          listDueOutbound: vi.fn().mockResolvedValue([]),
          markOutboundDelivered: vi.fn().mockResolvedValue(undefined),
          markOutboundAttempt: vi.fn(),
        },
        fetch: fetchMockWithoutBearer as unknown as typeof fetch,
      }
    );

    const initWithoutBearer = fetchMockWithoutBearer.mock.calls[0][1];
    expect(initWithoutBearer.headers["x-daisy-event-id"]).toBe("evt_hmac_no_bearer");
    expect(initWithoutBearer.headers["x-daisy-timestamp"]).toBeDefined();
    expect(initWithoutBearer.headers["x-daisy-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(initWithoutBearer.headers["authorization"]).toBeUndefined();

    const verifyResultWithoutBearer = verifyDaisySignature({
      secret,
      timestamp: initWithoutBearer.headers["x-daisy-timestamp"],
      signature: initWithoutBearer.headers["x-daisy-signature"],
      rawBody: initWithoutBearer.body as string,
    });
    expect(verifyResultWithoutBearer).toEqual({ ok: true });
  });

  it("2xx responses (200 and 202) are treated as delivered", async () => {
    for (const status of [200, 202]) {
      const event = createMockEvent({ id: `evt_2xx_${status}` });
      const deliveredMock = vi.fn().mockResolvedValue(undefined);
      const attemptMock = vi.fn().mockResolvedValue(undefined);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status,
        statusText: status === 200 ? "OK" : "Accepted",
      } as unknown as Response);

      const deps: OutboundDeps = {
        env: {
          DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
          DAISY_WEBHOOK_SECRET: secret,
          DAISY_WEBHOOK_BEARER: bearerToken,
        },
        repo: {
          insertOutboundEvent: vi.fn().mockResolvedValue(event),
          listDueOutbound: vi.fn().mockResolvedValue([]),
          markOutboundDelivered: deliveredMock,
          markOutboundAttempt: attemptMock,
        },
        fetch: fetchMock as unknown as typeof fetch,
      };

      await emitOutbound("owner.message", { projectId: "p1", messageId: "m1", body: "test" }, deps);

      expect(deliveredMock).toHaveBeenCalledWith(`evt_2xx_${status}`);
      expect(attemptMock).not.toHaveBeenCalled();
    }

    // Also test in deliverDueOutbound
    const event200 = createMockEvent({ id: "evt_due_200" });
    const event202 = createMockEvent({ id: "evt_due_202" });
    const deliveredMock = vi.fn().mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      return {
        ok: true,
        status: body.id === "evt_due_200" ? 200 : 202,
        statusText: "OK",
      } as unknown as Response;
    });

    const res = await deliverDueOutbound(10, {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: bearerToken,
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([event200, event202]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: vi.fn(),
      },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(res).toEqual({ attempted: 2, delivered: 2 });
    expect(deliveredMock).toHaveBeenCalledWith("evt_due_200");
    expect(deliveredMock).toHaveBeenCalledWith("evt_due_202");
  });

  it("non-2xx responses (401 and 500) are scheduled for retry with backoff", async () => {
    for (const { status, statusText } of [
      { status: 401, statusText: "Unauthorized" },
      { status: 500, statusText: "Internal Server Error" },
    ]) {
      const event = createMockEvent({ id: `evt_fail_${status}` });
      const deliveredMock = vi.fn().mockResolvedValue(undefined);
      const attemptMock = vi.fn().mockResolvedValue(undefined);
      const now = 1_500_000;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
      } as unknown as Response);

      const deps: OutboundDeps = {
        env: {
          DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
          DAISY_WEBHOOK_SECRET: secret,
          DAISY_WEBHOOK_BEARER: bearerToken,
        },
        repo: {
          insertOutboundEvent: vi.fn().mockResolvedValue(event),
          listDueOutbound: vi.fn().mockResolvedValue([]),
          markOutboundDelivered: deliveredMock,
          markOutboundAttempt: attemptMock,
        },
        fetch: fetchMock as unknown as typeof fetch,
        now: () => now,
      };

      await emitOutbound("owner.message", { projectId: "p1", messageId: "m1", body: "fail" }, deps);

      expect(deliveredMock).not.toHaveBeenCalled();
      expect(attemptMock).toHaveBeenCalledTimes(1);
      expect(attemptMock).toHaveBeenCalledWith(`evt_fail_${status}`, {
        error: `HTTP ${status} ${statusText}`,
        nextAttemptAt: now + 30_000,
        failed: false,
      });
    }

    // Also test in deliverDueOutbound
    const event401 = createMockEvent({ id: "evt_due_401", attempts: 0 });
    const event500 = createMockEvent({ id: "evt_due_500", attempts: 1 });
    const attemptMock = vi.fn().mockResolvedValue(undefined);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);
    const now = 2_000_000;

    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      if (body.id === "evt_due_401") {
        return { ok: false, status: 401, statusText: "Unauthorized" } as unknown as Response;
      }
      return { ok: false, status: 500, statusText: "Internal Server Error" } as unknown as Response;
    });

    const res = await deliverDueOutbound(10, {
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: bearerToken,
      },
      repo: {
        insertOutboundEvent: vi.fn(),
        listDueOutbound: vi.fn().mockResolvedValue([event401, event500]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now,
    });

    expect(res).toEqual({ attempted: 2, delivered: 0 });
    expect(deliveredMock).not.toHaveBeenCalled();
    expect(attemptMock).toHaveBeenCalledWith("evt_due_401", {
      error: "HTTP 401 Unauthorized",
      nextAttemptAt: now + 30_000,
      failed: false,
    });
    expect(attemptMock).toHaveBeenCalledWith("evt_due_500", {
      error: "HTTP 500 Internal Server Error",
      nextAttemptAt: now + 120_000,
      failed: false,
    });
  });

  it("bearer value never appears in console output or stored D1 params", async () => {
    const sensitiveBearer = "VERY_SECRET_BEARER_VAL_9999_NEVER_PRINT";
    const logSpy = vi.spyOn(console, "log");
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");
    const infoSpy = vi.spyOn(console, "info");

    const insertMock = vi.fn().mockImplementation(async (input) =>
      createMockEvent({ id: "evt_leak_check", payload: input.payload })
    );
    const attemptMock = vi.fn().mockResolvedValue(undefined);
    const deliveredMock = vi.fn().mockResolvedValue(undefined);

    const makeDeps = (fetchFn: typeof fetch): OutboundDeps => ({
      env: {
        DAISY_WEBHOOK_URL: "https://daisy.example.com/webhook",
        DAISY_WEBHOOK_SECRET: secret,
        DAISY_WEBHOOK_BEARER: sensitiveBearer,
      },
      repo: {
        insertOutboundEvent: insertMock,
        listDueOutbound: vi.fn().mockResolvedValue([createMockEvent({ id: "evt_due_leak_check" })]),
        markOutboundDelivered: deliveredMock,
        markOutboundAttempt: attemptMock,
      },
      fetch: fetchFn,
    });

    // 1. Success path
    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "hello" },
      makeDeps(vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response) as unknown as typeof fetch)
    );

    // 2. 401 Unauthorized failure
    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "unauth" },
      makeDeps(vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as unknown as Response) as unknown as typeof fetch)
    );

    // 3. 500 Internal Server Error failure
    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "server error" },
      makeDeps(vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" } as unknown as Response) as unknown as typeof fetch)
    );

    // 4. Network exception failure
    await emitOutbound(
      "owner.message",
      { projectId: "p1", messageId: "m1", body: "net error" },
      makeDeps(vi.fn().mockRejectedValue(new Error("Network connection dropped")) as unknown as typeof fetch)
    );

    // 5. Retry loop deliveries
    await deliverDueOutbound(
      5,
      makeDeps(vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" } as unknown as Response) as unknown as typeof fetch)
    );

    // Assert console output NEVER contains the secret bearer value
    const allConsoleCalls = [
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...infoSpy.mock.calls,
    ];
    for (const call of allConsoleCalls) {
      const text = JSON.stringify(call);
      expect(text).not.toContain(sensitiveBearer);
    }

    // Assert all repo calls (which map to D1 queries) NEVER contain the secret bearer value
    const allRepoCalls = [
      ...insertMock.mock.calls,
      ...attemptMock.mock.calls,
      ...deliveredMock.mock.calls,
    ];
    for (const call of allRepoCalls) {
      const text = JSON.stringify(call);
      expect(text).not.toContain(sensitiveBearer);
    }

    // Assert actual D1 queries issued by repo never contain the secret bearer value
    const d1QuerySpy = vi.spyOn(d1Http, "d1Query").mockResolvedValue({ results: [] });
    await repo.markOutboundAttempt("evt_leak_check", {
      error: "HTTP 401 Unauthorized",
      nextAttemptAt: Date.now() + 30000,
      failed: false,
    });
    await repo.markOutboundDelivered("evt_leak_check");
    for (const call of d1QuerySpy.mock.calls) {
      const text = JSON.stringify(call);
      expect(text).not.toContain(sensitiveBearer);
    }
    d1QuerySpy.mockRestore();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });
});

describe("Pull Authentication (verifyPullAuth)", () => {
  const secret = "pull_token_secret_123";

  it("returns 503 when DAISY_PULL_TOKEN is not configured", () => {
    const res = verifyPullAuth("Bearer token123", undefined);
    expect(res).toEqual({ ok: false, status: 503, code: "daisy_not_configured" });

    const resEmpty = verifyPullAuth("Bearer token123", "");
    expect(resEmpty).toEqual({ ok: false, status: 503, code: "daisy_not_configured" });
  });

  it("returns 401 when Authorization header is missing", () => {
    const res = verifyPullAuth(null, secret);
    expect(res).toEqual({ ok: false, status: 401, code: "missing_authorization" });
  });

  it("returns 401 when Authorization header format is not Bearer", () => {
    const res = verifyPullAuth("Basic dXNlcjpwYXNz", secret);
    expect(res).toEqual({ ok: false, status: 401, code: "unauthorized" });
  });

  it("returns 401 when Bearer token is incorrect", () => {
    const res = verifyPullAuth("Bearer wrong_token", secret);
    expect(res).toEqual({ ok: false, status: 401, code: "unauthorized" });
  });

  it("returns 401 when token length differs", () => {
    const res = verifyPullAuth("Bearer short", secret);
    expect(res).toEqual({ ok: false, status: 401, code: "unauthorized" });
  });

  it("returns ok: true when Bearer token matches in constant-time", () => {
    const res = verifyPullAuth(`Bearer ${secret}`, secret);
    expect(res).toEqual({ ok: true });
  });
});

describe("Pull Cursor & Pagination Semantics (pullEvents)", () => {
  it("returns events, nextCursor = last seq, and hasMore = false when within limit", async () => {
    const rows = [
      createMockEvent({ id: "e1", seq: 1 }),
      createMockEvent({ id: "e2", seq: 2 }),
      createMockEvent({ id: "e3", seq: 3 }),
    ];

    const listOutboundMock = vi.fn().mockResolvedValue(rows);
    const deliverMock = vi.fn().mockResolvedValue({ attempted: 0, delivered: 0 });

    const result = await pullEvents(
      { after: 0, limit: 10 },
      {
        repo: { listOutboundAfter: listOutboundMock },
        deliverDueOutbound: deliverMock,
      }
    );

    // Queries limit + 1
    expect(listOutboundMock).toHaveBeenCalledWith(0, 11);
    expect(result.events).toHaveLength(3);
    expect(result.events[0].id).toBe("e1");
    expect(result.events[2].id).toBe("e3");
    expect(result.nextCursor).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(deliverMock).toHaveBeenCalledWith(5);
  });

  it("returns sliced page and hasMore = true when rows exceed limit", async () => {
    const rows = [
      createMockEvent({ id: "e1", seq: 5 }),
      createMockEvent({ id: "e2", seq: 6 }),
      createMockEvent({ id: "e3", seq: 7 }), // extra item indicates hasMore
    ];

    const listOutboundMock = vi.fn().mockResolvedValue(rows);

    const result = await pullEvents(
      { after: 4, limit: 2 },
      {
        repo: { listOutboundAfter: listOutboundMock },
        deliverDueOutbound: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0 }),
      }
    );

    expect(listOutboundMock).toHaveBeenCalledWith(4, 3);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.seq)).toEqual([5, 6]);
    expect(result.nextCursor).toBe(6);
    expect(result.hasMore).toBe(true);
  });

  it("returns empty events and nextCursor = given after when no events exist", async () => {
    const listOutboundMock = vi.fn().mockResolvedValue([]);

    const result = await pullEvents(
      { after: 15, limit: 50 },
      {
        repo: { listOutboundAfter: listOutboundMock },
        deliverDueOutbound: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0 }),
      }
    );

    expect(result.events).toHaveLength(0);
    expect(result.nextCursor).toBe(15);
    expect(result.hasMore).toBe(false);
  });

  it("preserves delivered events in pull results (only status=acked is excluded by repo)", async () => {
    const rows = [
      createMockEvent({ id: "e_deliv", seq: 1, status: "delivered" }),
      createMockEvent({ id: "e_pend", seq: 2, status: "pending" }),
    ];

    const result = await pullEvents(
      { after: 0 },
      {
        repo: { listOutboundAfter: vi.fn().mockResolvedValue(rows) },
        deliverDueOutbound: vi.fn().mockResolvedValue({ attempted: 0, delivered: 0 }),
      }
    );

    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("e_deliv");
    expect(result.events[1].id).toBe("e_pend");
  });
});

describe("Acknowledge Semantics (ackEvents)", () => {
  it("calls repo.ackOutboundUpTo and returns acked count", async () => {
    const ackMock = vi.fn().mockResolvedValue(5);

    const res = await ackEvents(25, {
      repo: { ackOutboundUpTo: ackMock },
    });

    expect(ackMock).toHaveBeenCalledWith(25);
    expect(res).toEqual({ acked: 5 });
  });

  it("handles decimal numbers by flooring upTo", async () => {
    const ackMock = vi.fn().mockResolvedValue(2);

    const res = await ackEvents(10.7, {
      repo: { ackOutboundUpTo: ackMock },
    });

    expect(ackMock).toHaveBeenCalledWith(10);
    expect(res).toEqual({ acked: 2 });
  });
});

describe("Route Handlers End-to-End Tests", () => {
  describe("GET /api/daisy/events (Pull Route)", () => {
    it("returns 503 if DAISY_PULL_TOKEN is unset", async () => {
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = undefined;
      const req = new Request("https://localhost/api/daisy/events", {
        headers: { authorization: "Bearer some_token" },
      });
      const res = await eventsGetHandler(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("returns 401 if token is invalid", async () => {
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "valid_pull_token";
      const req = new Request("https://localhost/api/daisy/events", {
        headers: { authorization: "Bearer wrong_token" },
      });
      const res = await eventsGetHandler(req);
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("returns 200 with events and no-store when authorized", async () => {
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "valid_pull_token";
      const sampleEvent = createMockEvent({ id: "ev1", seq: 1 });
      vi.spyOn(repo, "listOutboundAfter").mockResolvedValueOnce([sampleEvent]);

      const req = new Request("https://localhost/api/daisy/events?after=0&limit=10", {
        headers: { authorization: "Bearer valid_pull_token" },
      });
      const res = await eventsGetHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const json = await res.json();
      expect(json.events).toHaveLength(1);
      expect(json.nextCursor).toBe(1);
      expect(json.hasMore).toBe(false);
    });
  });

  describe("POST /api/daisy/events/ack (Ack Route)", () => {
    it("returns 400 when body does not have valid upTo", async () => {
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "valid_pull_token";
      const req = new Request("https://localhost/api/daisy/events/ack", {
        method: "POST",
        headers: {
          authorization: "Bearer valid_pull_token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ invalid: true }),
      });
      const res = await eventsAckPostHandler(req);
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("returns 200 with acked count when valid", async () => {
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "valid_pull_token";
      vi.spyOn(repo, "ackOutboundUpTo").mockResolvedValueOnce(3);

      const req = new Request("https://localhost/api/daisy/events/ack", {
        method: "POST",
        headers: {
          authorization: "Bearer valid_pull_token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ upTo: 5 }),
      });
      const res = await eventsAckPostHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const json = await res.json();
      expect(json.acked).toBe(3);
    });
  });

  describe("GET /api/daisy/outbound/deliver (Cron Route)", () => {
    it("returns 503 if neither CRON_SECRET nor DAISY_PULL_TOKEN configured", async () => {
      (env as Record<string, unknown>).CRON_SECRET = undefined;
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = undefined;

      const req = new Request("https://localhost/api/daisy/outbound/deliver", {
        headers: { authorization: "Bearer something" },
      });
      const res = await deliverGetHandler(req);
      expect(res.status).toBe(503);
    });

    it("returns 401 if token does not match either secret", async () => {
      (env as Record<string, unknown>).CRON_SECRET = "cron_secret_abc";
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "pull_token_xyz";

      const req = new Request("https://localhost/api/daisy/outbound/deliver", {
        headers: { authorization: "Bearer invalid_secret" },
      });
      const res = await deliverGetHandler(req);
      expect(res.status).toBe(401);
    });

    it("allows Authorization: Bearer CRON_SECRET", async () => {
      (env as Record<string, unknown>).CRON_SECRET = "cron_secret_abc";
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "pull_token_xyz";

      const req = new Request("https://localhost/api/daisy/outbound/deliver", {
        headers: { authorization: "Bearer cron_secret_abc" },
      });
      const res = await deliverGetHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("allows Authorization: Bearer DAISY_PULL_TOKEN as alternative", async () => {
      (env as Record<string, unknown>).CRON_SECRET = "cron_secret_abc";
      (env as Record<string, unknown>).DAISY_PULL_TOKEN = "pull_token_xyz";

      const req = new Request("https://localhost/api/daisy/outbound/deliver", {
        headers: { authorization: "Bearer pull_token_xyz" },
      });
      const res = await deliverGetHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });
});
