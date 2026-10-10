import { env as defaultEnv } from "@/env";
import * as defaultRepo from "@/lib/daisy/repo";
import { buildSignedHeaders as defaultBuildSignedHeaders } from "@/lib/daisy/signing";
import crypto from "node:crypto";
import type {
  DaisyEvent,
  OutboundEnvelope,
  OutboundEventType,
  OutboundPayloads,
} from "./types";

export const BACKOFF_DELAYS_MS = [
  30_000, // 30s
  120_000, // 2m
  600_000, // 10m
  1_800_000, // 30m
  7_200_000, // 2h
  21_600_000, // 6h
  43_200_000, // 12h
] as const;

export const MAX_ATTEMPTS = 8;

export function calculateBackoff(
  currentAttempts: number,
  now: number = Date.now()
): { nextAttemptAt: number | null; failed: boolean } {
  if (currentAttempts >= MAX_ATTEMPTS) {
    return { nextAttemptAt: null, failed: true };
  }
  const delayIndex = Math.max(0, currentAttempts - 1);
  const delay =
    BACKOFF_DELAYS_MS[delayIndex] ??
    BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
  return { nextAttemptAt: now + delay, failed: false };
}

export function toEnvelope<T extends OutboundEventType = OutboundEventType>(
  e: DaisyEvent
): OutboundEnvelope<T> {
  const createdAtIso =
    typeof e.createdAt === "number"
      ? new Date(e.createdAt).toISOString()
      : typeof e.createdAt === "string"
      ? e.createdAt
      : new Date().toISOString();

  let payload = e.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      // keep raw string if not json
    }
  }

  return {
    id: e.id,
    seq: e.seq,
    type: e.type as T,
    createdAt: createdAtIso,
    data: payload as OutboundPayloads[T],
  };
}

export type OutboundDeps = {
  env?: {
    DAISY_WEBHOOK_URL?: string;
    DAISY_WEBHOOK_SECRET?: string;
    DAISY_WEBHOOK_BEARER?: string;
  };
  repo?: {
    insertOutboundEvent: (input: {
      type: OutboundEventType;
      projectId: string | null;
      payload: unknown;
    }) => Promise<DaisyEvent>;
    listDueOutbound: (now: number, limit: number) => Promise<DaisyEvent[]>;
    markOutboundDelivered: (id: string) => Promise<void>;
    markOutboundAttempt: (
      id: string,
      input: { error: string; nextAttemptAt: number | null; failed: boolean }
    ) => Promise<void>;
  };
  buildSignedHeaders?: (
    secret: string,
    rawBody: string,
    eventId: string
  ) => Record<string, string>;
  fetch?: typeof fetch;
  now?: () => number;
};

/** Strip the bearer value from any string we persist (e.g. D1 last_error). */
function redactSecret(message: string, secret?: string): string {
  const t = secret?.trim();
  return t ? message.split(t).join("[redacted]") : message;
}

export function buildOutboundHeaders(
  signedHeaders: Record<string, string>,
  bearer?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "potencia-dashboard-daisy/1",
    ...signedHeaders,
  };
  if (bearer && bearer.trim() !== "") {
    headers["authorization"] = `Bearer ${bearer.trim()}`;
  }
  return headers;
}

function fallbackBuildSignedHeaders(
  secret: string,
  rawBody: string,
  eventId: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature =
    "v1=" +
    crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
  return {
    "x-daisy-signature": signature,
    "x-daisy-timestamp": timestamp,
    "x-daisy-event-id": eventId,
  };
}

/**
 * Stores an outbound event and attempts immediate push delivery if DAISY_WEBHOOK_URL is configured.
 * Never throws on delivery failure (delays are scheduled for retry).
 * Also opportunistically delivers up to 5 due outbound events.
 */
export async function emitOutbound<T extends OutboundEventType>(
  type: T,
  data: OutboundPayloads[T],
  deps?: OutboundDeps
): Promise<DaisyEvent> {
  const repo = deps?.repo ?? defaultRepo;
  const envVars = deps?.env ?? defaultEnv;
  const fetchFn = deps?.fetch ?? fetch;
  const nowFn = deps?.now ?? Date.now;
  const buildHeadersFn =
    deps?.buildSignedHeaders ??
    (typeof defaultBuildSignedHeaders === "function"
      ? defaultBuildSignedHeaders
      : fallbackBuildSignedHeaders);

  const projectId = (data as { projectId?: string })?.projectId ?? null;
  const storedEvent = await repo.insertOutboundEvent({
    type,
    projectId,
    payload: data,
  });

  const webhookUrl = envVars.DAISY_WEBHOOK_URL;
  const webhookSecret = envVars.DAISY_WEBHOOK_SECRET;
  const webhookBearer = envVars.DAISY_WEBHOOK_BEARER;

  if (webhookUrl && webhookSecret) {
    try {
      const envelope = toEnvelope(storedEvent);
      const rawBody = JSON.stringify(envelope);
      const signedHeaders = buildHeadersFn(webhookSecret, rawBody, storedEvent.id);
      const headers = buildOutboundHeaders(signedHeaders, webhookBearer);

      const res = await fetchFn(webhookUrl, {
        method: "POST",
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await repo.markOutboundDelivered(storedEvent.id);
      } else {
        const { nextAttemptAt, failed } = calculateBackoff(1, nowFn());
        await repo.markOutboundAttempt(storedEvent.id, {
          error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
          nextAttemptAt,
          failed,
        });
      }
    } catch (err: unknown) {
      const errorMessage = redactSecret(
        err instanceof Error ? err.message : String(err),
        webhookBearer
      );
      const { nextAttemptAt, failed } = calculateBackoff(1, nowFn());
      await repo.markOutboundAttempt(storedEvent.id, {
        error: errorMessage,
        nextAttemptAt,
        failed,
      });
    }
  }

  // Opportunistically trigger retry of up to 5 due events (catch any errors)
  try {
    await deliverDueOutbound(5, deps);
  } catch {
    // ignore background delivery errors
  }

  return storedEvent;
}

/**
 * Attempts delivery for pending outbound events whose nextAttemptAt is <= now.
 */
export async function deliverDueOutbound(
  limit: number = 50,
  deps?: OutboundDeps
): Promise<{ attempted: number; delivered: number }> {
  const repo = deps?.repo ?? defaultRepo;
  const envVars = deps?.env ?? defaultEnv;
  const fetchFn = deps?.fetch ?? fetch;
  const nowFn = deps?.now ?? Date.now;
  const buildHeadersFn =
    deps?.buildSignedHeaders ??
    (typeof defaultBuildSignedHeaders === "function"
      ? defaultBuildSignedHeaders
      : fallbackBuildSignedHeaders);

  const webhookUrl = envVars.DAISY_WEBHOOK_URL;
  const webhookSecret = envVars.DAISY_WEBHOOK_SECRET;
  const webhookBearer = envVars.DAISY_WEBHOOK_BEARER;

  if (!webhookUrl || !webhookSecret) {
    return { attempted: 0, delivered: 0 };
  }

  const dueEvents = await repo.listDueOutbound(nowFn(), limit);
  let attempted = 0;
  let delivered = 0;

  for (const event of dueEvents) {
    attempted++;
    const nextAttemptCount = (event.attempts ?? 0) + 1;

    try {
      const envelope = toEnvelope(event);
      const rawBody = JSON.stringify(envelope);
      const signedHeaders = buildHeadersFn(webhookSecret, rawBody, event.id);
      const headers = buildOutboundHeaders(signedHeaders, webhookBearer);

      const res = await fetchFn(webhookUrl, {
        method: "POST",
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        await repo.markOutboundDelivered(event.id);
        delivered++;
      } else {
        const { nextAttemptAt, failed } = calculateBackoff(
          nextAttemptCount,
          nowFn()
        );
        await repo.markOutboundAttempt(event.id, {
          error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
          nextAttemptAt,
          failed,
        });
      }
    } catch (err: unknown) {
      const errorMessage = redactSecret(
        err instanceof Error ? err.message : String(err),
        webhookBearer
      );
      const { nextAttemptAt, failed } = calculateBackoff(
        nextAttemptCount,
        nowFn()
      );
      await repo.markOutboundAttempt(event.id, {
        error: errorMessage,
        nextAttemptAt,
        failed,
      });
    }
  }

  return { attempted, delivered };
}
