import { describe, expect, it } from "vitest";
import { parseRateLimitHeaders, parseRetryAfter } from "../../src/client/rateLimit.js";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("parseRateLimitHeaders", () => {
  it("extracts all five fields when every header is present", () => {
    const info = parseRateLimitHeaders(
      headers({
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "42",
        "X-RateLimit-Reset": "1700000000",
        "X-RateLimit-Concurrent-Limit": "5",
        "X-RateLimit-Concurrent-Remaining": "2",
      }),
    );
    expect(info).toEqual({
      limit: 60,
      remaining: 42,
      reset: 1700000000,
      concurrentLimit: 5,
      concurrentRemaining: 2,
    });
  });

  it("omits missing fields and returns undefined when all absent", () => {
    expect(parseRateLimitHeaders(headers({}))).toBeUndefined();
  });

  it("includes only the fields that are present", () => {
    const info = parseRateLimitHeaders(
      headers({
        "X-RateLimit-Remaining": "7",
        "X-RateLimit-Concurrent-Remaining": "0",
      }),
    );
    expect(info).toEqual({ remaining: 7, concurrentRemaining: 0 });
  });

  it("ignores non-numeric header values", () => {
    const info = parseRateLimitHeaders(
      headers({
        "X-RateLimit-Limit": "not-a-number",
        "X-RateLimit-Remaining": "10",
      }),
    );
    expect(info).toEqual({ remaining: 10 });
  });

  it("is case-insensitive for header names (Headers class behavior)", () => {
    const info = parseRateLimitHeaders(headers({ "x-ratelimit-remaining": "3" }));
    expect(info).toEqual({ remaining: 3 });
  });
});

describe("parseRetryAfter", () => {
  it("returns integer seconds when Retry-After is a positive integer", () => {
    expect(parseRetryAfter(headers({ "Retry-After": "5" }))).toBe(5);
  });

  it("returns 0 when Retry-After is 0", () => {
    expect(parseRetryAfter(headers({ "Retry-After": "0" }))).toBe(0);
  });

  it("returns undefined when header is missing", () => {
    expect(parseRetryAfter(headers({}))).toBeUndefined();
  });

  it("returns undefined for negative values", () => {
    expect(parseRetryAfter(headers({ "Retry-After": "-3" }))).toBeUndefined();
  });

  it("returns undefined for non-numeric values (HTTP-date format unsupported)", () => {
    expect(
      parseRetryAfter(headers({ "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" })),
    ).toBeUndefined();
  });

  it("returns undefined for NaN-inducing input", () => {
    expect(parseRetryAfter(headers({ "Retry-After": "" }))).toBeUndefined();
  });
});
