import { env } from "@/env";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type DaisyRateLimitKind = "inbound" | "pull" | "ui";

const LIMITS: Record<DaisyRateLimitKind, number> = {
  inbound: 120,
  pull: 60,
  ui: 60,
};

const WINDOW_MS = 60_000;

// In-memory sliding window fallback
const memoryStore = new Map<string, number[]>();

export function clearMemoryRateLimits(): void {
  memoryStore.clear();
}

function checkMemoryFallback(
  key: string,
  kind: DaisyRateLimitKind
): { ok: boolean; retryAfter?: number } {
  const limit = LIMITS[kind];
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const storageKey = `${kind}:${key}`;

  const current = (memoryStore.get(storageKey) || []).filter((t) => t > cutoff);

  if (current.length >= limit) {
    const oldest = current[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    memoryStore.set(storageKey, current);
    return { ok: false, retryAfter };
  }

  current.push(now);
  memoryStore.set(storageKey, current);
  return { ok: true };
}

let upstashLimiters: Record<DaisyRateLimitKind, Ratelimit> | null = null;

function getUpstashLimiter(kind: DaisyRateLimitKind): Ratelimit | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (!upstashLimiters) {
    const redis = new Redis({ url, token });
    upstashLimiters = {
      inbound: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.inbound, "60 s"),
        prefix: "daisy",
      }),
      pull: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.pull, "60 s"),
        prefix: "daisy",
      }),
      ui: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMITS.ui, "60 s"),
        prefix: "daisy",
      }),
    };
  }

  return upstashLimiters[kind];
}

export async function daisyRateLimit(
  key: string,
  kind: DaisyRateLimitKind
): Promise<{ ok: boolean; retryAfter?: number }> {
  const limiter = getUpstashLimiter(kind);
  if (limiter) {
    try {
      const res = await limiter.limit(`${kind}:${key}`);
      if (!res.success) {
        const retryAfter = Math.max(
          1,
          Math.ceil((res.reset - Date.now()) / 1000)
        );
        return { ok: false, retryAfter };
      }
      return { ok: true };
    } catch {
      return checkMemoryFallback(key, kind);
    }
  }

  return checkMemoryFallback(key, kind);
}
