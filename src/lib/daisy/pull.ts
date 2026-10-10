import * as defaultRepo from "@/lib/daisy/repo";
import crypto from "node:crypto";
import { deliverDueOutbound, toEnvelope } from "./outbound";
import type { DaisyEvent, OutboundEnvelope } from "./types";

/**
 * Constant-time string equality check to prevent timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const hashA = crypto.createHash("sha256").update(bufA).digest();
    const hashB = crypto.createHash("sha256").update(bufB).digest();
    crypto.timingSafeEqual(hashA, hashB);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies Bearer token against an expected secret in constant time.
 * Returns 503 if secret is unset/empty, 401 if token is missing or mismatch.
 */
export function verifyPullAuth(
  authHeader: string | null | undefined,
  expectedToken: string | undefined
): { ok: true } | { ok: false; status: 503 | 401; code: string } {
  if (!expectedToken || expectedToken.trim() === "") {
    return { ok: false, status: 503, code: "daisy_not_configured" };
  }
  if (!authHeader) {
    return { ok: false, status: 401, code: "missing_authorization" };
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 401, code: "unauthorized" };
  }
  const token = match[1].trim();
  if (!timingSafeEqualString(token, expectedToken.trim())) {
    return { ok: false, status: 401, code: "unauthorized" };
  }
  return { ok: true };
}

export type PullDeps = {
  repo?: {
    listOutboundAfter: (seq: number, limit: number) => Promise<DaisyEvent[]>;
  };
  deliverDueOutbound?: (
    limit?: number
  ) => Promise<{ attempted: number; delivered: number }>;
};

/**
 * Pulls outbound events with cursor pagination.
 * Events are returned in seq ascending order. Delivered events remain pullable until acked.
 * Next cursor is the last event seq or the given `after` if no events were found.
 */
export async function pullEvents(
  options: { after?: number; limit?: number } = {},
  deps?: PullDeps
): Promise<{
  events: OutboundEnvelope[];
  nextCursor: number;
  hasMore: boolean;
}> {
  const repo = deps?.repo ?? defaultRepo;
  const deliverFn = deps?.deliverDueOutbound ?? deliverDueOutbound;

  const rawAfter = options.after ?? 0;
  const after =
    typeof rawAfter === "number" && !isNaN(rawAfter) && rawAfter >= 0
      ? rawAfter
      : 0;
  const rawLimit = options.limit ?? 50;
  const limit =
    typeof rawLimit === "number" && !isNaN(rawLimit)
      ? Math.min(100, Math.max(1, rawLimit))
      : 50;

  // Query limit + 1 to determine hasMore
  const rows = await repo.listOutboundAfter(after, limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const envelopes = pageRows.map(toEnvelope);
  const nextCursor =
    pageRows.length > 0 ? pageRows[pageRows.length - 1].seq : after;

  // Opportunistically trigger delivery retries on pull
  try {
    await deliverFn(5);
  } catch {
    // ignore background delivery errors
  }

  return {
    events: envelopes,
    nextCursor,
    hasMore,
  };
}

export type AckDeps = {
  repo?: {
    ackOutboundUpTo: (seq: number) => Promise<number>;
  };
};

/**
 * Acknowledges outbound events with seq <= upTo.
 */
export async function ackEvents(
  upTo: number,
  deps?: AckDeps
): Promise<{ acked: number }> {
  const repo = deps?.repo ?? defaultRepo;
  const cleanUpTo = Math.max(0, Math.floor(upTo));
  const count = await repo.ackOutboundUpTo(cleanUpTo);
  return { acked: count };
}
