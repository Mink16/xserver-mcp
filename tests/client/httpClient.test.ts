import { afterEach, describe, expect, it, vi } from "vitest";
import {
  XserverApiError,
  XserverAuthError,
  XserverForbiddenError,
  XserverNotFoundError,
  XserverOperationError,
  XserverRateLimitError,
  XserverServerError,
  XserverValidationError,
} from "../../src/client/errors.js";
import { createHttpClient, type HttpClientConfig } from "../../src/client/httpClient.js";
import { installFetchMock } from "../helpers/mockFetch.js";

const baseConfig: HttpClientConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.xserver.ne.jp",
  concurrency: 10,
  retry: { maxAttempts: 1, maxWaitSec: 10 },
};

describe("httpClient — request basics", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("sends GET with Bearer Authorization and default Accept header", async () => {
    const { calls, restore: r } = installFetchMock({ body: { ok: true } });
    restore = r;

    const client = createHttpClient(baseConfig);
    const result = await client.request({ method: "GET", path: "/v1/me" });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/me");
    expect(calls[0]?.headers.Authorization).toBe("Bearer test-key");
    expect(calls[0]?.headers.Accept).toBe("application/json");
  });

  it("appends query params and URL-encodes values", async () => {
    const { calls, restore: r } = installFetchMock({ body: { accounts: [] } });
    restore = r;

    const client = createHttpClient(baseConfig);
    await client.request({
      method: "GET",
      path: "/v1/server/sv/mail",
      query: { domain: "example.com", empty: undefined, keep: "" },
    });

    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv/mail?domain=example.com");
  });

  it("sends POST with JSON body and Content-Type", async () => {
    const { calls, restore: r } = installFetchMock({ body: { id: "abc" } });
    restore = r;

    const client = createHttpClient(baseConfig);
    await client.request({
      method: "POST",
      path: "/v1/server/sv/mail",
      body: { mail_address: "x@y.com", password: "secret" },
    });

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.body).toEqual({
      mail_address: "x@y.com",
      password: "secret",
    });
  });

  it("returns null for 204 No Content", async () => {
    const { restore: r } = installFetchMock({ status: 204, text: "" });
    restore = r;

    const client = createHttpClient(baseConfig);
    const result = await client.request({
      method: "DELETE",
      path: "/v1/server/sv/mail/x%40y.com",
    });
    expect(result).toBeNull();
  });
});

describe("httpClient — error class mapping", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  const cases: Array<[number, new (...args: never[]) => XserverApiError]> = [
    [400, XserverApiError],
    [401, XserverAuthError],
    [403, XserverForbiddenError],
    [404, XserverNotFoundError],
    [409, XserverOperationError],
    [422, XserverValidationError],
    [429, XserverRateLimitError],
    [500, XserverServerError],
    [502, XserverServerError],
  ];
  for (const [status, Klass] of cases) {
    it(`maps ${status} to ${Klass.name}`, async () => {
      const { restore: r } = installFetchMock({
        status,
        body: { error: { message: `status ${status}` } },
      });
      restore = r;
      const client = createHttpClient(baseConfig);
      await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toBeInstanceOf(Klass);
    });
  }

  it("preserves status and body on generic XserverApiError for unmapped 418", async () => {
    const { restore: r } = installFetchMock({
      status: 418,
      body: { message: "teapot" },
    });
    restore = r;
    const client = createHttpClient(baseConfig);
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toMatchObject({
      status: 418,
      code: "API_ERROR",
    });
  });
});

describe("httpClient — rate limit headers & retry", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("populates retryAfterSeconds and rateLimit on 429", async () => {
    const { restore: r } = installFetchMock({
      status: 429,
      body: { error: { code: "RATE_LIMIT_EXCEEDED", message: "slow down" } },
      headers: {
        "Retry-After": "3",
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
      },
    });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      retry: { maxAttempts: 1, maxWaitSec: 10 },
    });
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 3,
      rateLimit: { limit: 60, remaining: 0 },
    });
  });

  it("retries once when Retry-After <= maxWaitSec and succeeds on 2nd attempt", async () => {
    vi.useFakeTimers();
    try {
      const { calls, restore: r } = installFetchMock({
        queue: [
          {
            status: 429,
            body: { error: { code: "RATE_LIMIT_EXCEEDED", message: "slow" } },
            headers: { "Retry-After": "2" },
          },
          { body: { ok: true } },
        ],
      });
      restore = r;
      const client = createHttpClient({
        ...baseConfig,
        retry: { maxAttempts: 2, maxWaitSec: 10 },
      });
      const promise = client.request({ method: "GET", path: "/v1/x" });
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
      expect(calls.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry when Retry-After exceeds maxWaitSec", async () => {
    const { calls, restore: r } = installFetchMock({
      queue: [
        {
          status: 429,
          body: { error: { code: "RATE_LIMIT_EXCEEDED", message: "slow" } },
          headers: { "Retry-After": "60" },
        },
      ],
    });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      retry: { maxAttempts: 3, maxWaitSec: 10 },
    });
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toBeInstanceOf(
      XserverRateLimitError,
    );
    expect(calls.length).toBe(1);
  });

  it("does not retry concurrent-limit 429 (X-RateLimit-Concurrent-Remaining=0)", async () => {
    const { calls, restore: r } = installFetchMock({
      queue: [
        {
          status: 429,
          body: { error: { code: "RATE_LIMIT_EXCEEDED", message: "concurrent" } },
          headers: {
            "Retry-After": "1",
            "X-RateLimit-Concurrent-Remaining": "0",
          },
        },
      ],
    });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      retry: { maxAttempts: 3, maxWaitSec: 10 },
    });
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toBeInstanceOf(
      XserverRateLimitError,
    );
    expect(calls.length).toBe(1);
  });

  it("does not retry when maxAttempts=1 (retry disabled)", async () => {
    const { calls, restore: r } = installFetchMock({
      queue: [
        {
          status: 429,
          body: {},
          headers: { "Retry-After": "1" },
        },
      ],
    });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      retry: { maxAttempts: 1, maxWaitSec: 10 },
    });
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toBeInstanceOf(
      XserverRateLimitError,
    );
    expect(calls.length).toBe(1);
  });

  it("does not retry on non-429 errors (500)", async () => {
    const { calls, restore: r } = installFetchMock({
      queue: [{ status: 500, body: { message: "boom" } }],
    });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      retry: { maxAttempts: 3, maxWaitSec: 10 },
    });
    await expect(client.request({ method: "GET", path: "/v1/x" })).rejects.toBeInstanceOf(
      XserverServerError,
    );
    expect(calls.length).toBe(1);
  });
});

describe("httpClient — concurrency semaphore", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("limits concurrent in-flight requests to config.concurrency", async () => {
    const { maxActive, restore: r } = installFetchMock({ body: { ok: true } });
    restore = r;
    const client = createHttpClient({
      ...baseConfig,
      concurrency: 2,
    });
    const promises = Array.from({ length: 8 }, (_, i) =>
      client.request({ method: "GET", path: `/v1/x${i}` }),
    );
    await Promise.all(promises);
    expect(maxActive()).toBeLessThanOrEqual(2);
  });
});
