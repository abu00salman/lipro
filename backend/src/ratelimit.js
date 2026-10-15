// Fixed-window rate limiter backed by D1. `bucket` must already be a hashed key.
import { ApiError } from './util.js';

export async function hit(db, bucket, limit, windowSeconds, nowMs = Date.now()) {
  const window = Math.floor(nowMs / 1000 / windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window, hits) VALUES (?, ?, 1)
       ON CONFLICT (bucket, window) DO UPDATE SET hits = hits + 1
       RETURNING hits`
    )
    .bind(bucket, window)
    .first();
  if (row.hits > limit) {
    const retryAfter = windowSeconds - Math.floor((nowMs / 1000) % windowSeconds);
    throw new ApiError(429, 'rate_limited', 'محاولات كثيرة، حاول لاحقًا.', undefined, { 'Retry-After': String(retryAfter) });
  }
  return row.hits;
}
