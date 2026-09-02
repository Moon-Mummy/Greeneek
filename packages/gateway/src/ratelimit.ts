/**
 * Token-bucket rate limiter (feature 12).
 *
 * Per key (user / API key / IP) and per route. The gateway middleware uses
 * this before any request is dispatched — 429 with Retry-After on exhaustion.
 */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {}

  take(key: string, cost = 1): { allowed: boolean; remaining: number; retryAfterMs: number; resetMs: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updated: now };
    const elapsed = (now - bucket.updated) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.updated = now;

    if (bucket.tokens < cost) {
      const retryAfterMs = Math.ceil(((cost - bucket.tokens) / this.refillPerSecond) * 1000);
      const resetMs = Math.ceil((this.capacity / this.refillPerSecond) * 1000);
      return { allowed: false, remaining: 0, retryAfterMs, resetMs };
    }
    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: bucket.tokens, retryAfterMs: 0, resetMs: 0 };
  }

  stats(): { keys: number } {
    return { keys: this.buckets.size };
  }
}

/** Per-route limits: e.g. chat 60/min per key, tools 240/min, audit export 10/min. */
export class RateLimitTable {
  private buckets = new Map<string, TokenBucket>();

  constructor(private limits: Record<string, { capacity: number; refillPerSecond: number }>) {}

  take(route: string, key: string): ReturnType<TokenBucket["take"]> {
    const spec = this.limits[route] ?? { capacity: 1000, refillPerSecond: 100 };
    let bucket = this.buckets.get(route);
    if (!bucket) {
      bucket = new TokenBucket(spec.capacity, spec.refillPerSecond);
      this.buckets.set(route, bucket);
    }
    return bucket.take(key);
  }
}
