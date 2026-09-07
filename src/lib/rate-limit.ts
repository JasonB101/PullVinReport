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
 * Best-effort in-process rate limiter.
 *
 * Known limitation — this counts per process, not per deployment. On a
 * serverless or multi-instance host the effective limit is the configured
 * limit times the number of live instances, and a cold start resets the count
 * entirely, so it cannot be relied on as the only control on a public site.
 * It also trusts `x-forwarded-for`, which only holds behind a proxy that
 * overwrites the header.
 *
 * It is enough to blunt casual abuse and accidental double-submits. Before
 * taking real traffic, put a shared limiter in front of `/api/checkout` and
 * `/admin/login` — the host's edge/WAF rules, or a limiter backed by the same
 * Postgres or a Redis instance the app already talks to.
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
