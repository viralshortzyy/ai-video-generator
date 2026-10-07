// ── In-memory sliding-window rate limiter ───────────────────────────────
// Protects expensive endpoints (generation creation, uploads) from abuse.
// Note: in-memory = per-instance. With multiple server instances, move to
// Redis/Upstash. Fine for MVP and single-instance deploys.

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  bucket.hits.push(now);
  return { allowed: true, retryAfterSec: 0, remaining: limit - bucket.hits.length };
}

// Generous dev defaults; tighten in production via env if desired.
export const LIMITS = {
  createGeneration: { limit: 20, windowMs: 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
} as const;
