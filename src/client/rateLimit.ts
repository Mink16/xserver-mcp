export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;
  concurrentLimit?: number;
  concurrentRemaining?: number;
}

const FIELD_HEADER_MAP: ReadonlyArray<[keyof RateLimitInfo, string]> = [
  ["limit", "X-RateLimit-Limit"],
  ["remaining", "X-RateLimit-Remaining"],
  ["reset", "X-RateLimit-Reset"],
  ["concurrentLimit", "X-RateLimit-Concurrent-Limit"],
  ["concurrentRemaining", "X-RateLimit-Concurrent-Remaining"],
];

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const info: RateLimitInfo = {};
  let any = false;
  for (const [field, header] of FIELD_HEADER_MAP) {
    const raw = headers.get(header);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    info[field] = n;
    any = true;
  }
  return any ? info : undefined;
}

export function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get("Retry-After");
  if (raw === null || raw === "") return undefined;
  if (!/^-?\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
