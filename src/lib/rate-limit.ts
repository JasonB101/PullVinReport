type Bucket = { count: number; resetAt: number };

declare global {
  var __pullvinreportRateLimit: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!globalThis.__pullvinreportRateLimit) {
    globalThis.__pullvinreportRateLimit = new Map();
  }
  return globalThis.__pullvinreportRateLimit;
}

/**
 * Best-effort in-process rate limiter. Enough to blunt casual abuse of the
 * checkout endpoint; a multi-instance deployment should front this with a
 * shared limiter at the edge.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const store = buckets();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    if (store.size > 5_000) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
