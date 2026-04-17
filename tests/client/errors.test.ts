import { describe, expect, it } from "vitest";
import {
  XserverApiError,
  XserverAuthError,
  XserverForbiddenError,
  XserverNotFoundError,
  XserverOperationError,
  XserverRateLimitError,
  XserverServerError,
  XserverValidationError,
  errorCodeFromStatus,
  errorFromResponse,
  isRetryableRateLimit,
} from "../../src/client/errors.js";

function H(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

describe("errorCodeFromStatus", () => {
  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "OPERATION_ERROR"],
    [422, "VALIDATION_ERROR"],
    [429, "RATE_LIMIT_EXCEEDED"],
    [500, "INTERNAL_ERROR"],
    [502, "BACKEND_ERROR"],
    [418, "API_ERROR"],
    [503, "API_ERROR"],
  ])("maps status %i to %s", (status, code) => {
    expect(errorCodeFromStatus(status)).toBe(code);
  });
});

describe("errorFromResponse — class selection", () => {
  const cases: Array<[number, new (...args: never[]) => XserverApiError]> = [
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
    it(`returns ${Klass.name} for status ${status}`, () => {
      const err = errorFromResponse(status, {}, H());
      expect(err).toBeInstanceOf(Klass);
      expect(err).toBeInstanceOf(XserverApiError);
    });
  }
  it("returns generic XserverApiError for unknown status (418)", () => {
    const err = errorFromResponse(418, {}, H());
    expect(err).toBeInstanceOf(XserverApiError);
    expect(err).not.toBeInstanceOf(XserverAuthError);
  });
});

describe("errorFromResponse — body parsing", () => {
  it("prefers official { error: { code, message, errors } } form", () => {
    const err = errorFromResponse(
      422,
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "入力が不正です",
          errors: ["mail_address は必須です", "password は 6 文字以上"],
        },
      },
      H(),
    );
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("入力が不正です");
    expect(err.errors).toEqual(["mail_address は必須です", "password は 6 文字以上"]);
  });

  it("falls back to legacy flat { message } form", () => {
    const err = errorFromResponse(422, { message: "invalid mail_address" }, H());
    expect(err.message).toBe("invalid mail_address");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.errors).toEqual([]);
  });

  it("uses errorCodeFromStatus when body has no code", () => {
    const err = errorFromResponse(409, { message: "操作失敗" }, H());
    expect(err.code).toBe("OPERATION_ERROR");
  });

  it("preserves unknown server-supplied code strings", () => {
    const err = errorFromResponse(409, { error: { code: "CUSTOM_CODE", message: "x" } }, H());
    expect(err.code).toBe("CUSTOM_CODE");
  });

  it("normalizes object-shaped errors[] elements to strings", () => {
    const err = errorFromResponse(
      422,
      { error: { message: "bad", errors: [{ field: "mail_address" }, "extra"] } },
      H(),
    );
    expect(err.errors.length).toBe(2);
    expect(err.errors[1]).toBe("extra");
    expect(err.errors[0]).toContain("mail_address");
  });

  it("falls back to default message when body has none", () => {
    const err = errorFromResponse(500, null, H());
    expect(err.message).toMatch(/status 500/);
  });
});

describe("errorFromResponse — rate limit & retry-after extraction", () => {
  it("populates rateLimit and retryAfterSeconds on 429", () => {
    const err = errorFromResponse(
      429,
      { error: { code: "RATE_LIMIT_EXCEEDED", message: "slow down" } },
      H({
        "Retry-After": "3",
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Concurrent-Remaining": "2",
      }),
    ) as XserverRateLimitError;
    expect(err).toBeInstanceOf(XserverRateLimitError);
    expect(err.retryAfterSeconds).toBe(3);
    expect(err.rateLimit).toEqual({
      limit: 60,
      remaining: 0,
      concurrentRemaining: 2,
    });
  });

  it("leaves retryAfterSeconds undefined when header absent", () => {
    const err = errorFromResponse(429, {}, H()) as XserverRateLimitError;
    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.rateLimit).toBeUndefined();
  });
});

describe("isRetryableRateLimit", () => {
  it("returns false when concurrentRemaining is 0 (concurrent-limit 429)", () => {
    const err = errorFromResponse(
      429,
      {},
      H({ "X-RateLimit-Concurrent-Remaining": "0" }),
    ) as XserverRateLimitError;
    expect(isRetryableRateLimit(err)).toBe(false);
  });

  it("returns true when concurrentRemaining > 0", () => {
    const err = errorFromResponse(
      429,
      {},
      H({ "X-RateLimit-Concurrent-Remaining": "3" }),
    ) as XserverRateLimitError;
    expect(isRetryableRateLimit(err)).toBe(true);
  });

  it("returns true when concurrent header is absent (assume rate-limit 429)", () => {
    const err = errorFromResponse(429, {}, H()) as XserverRateLimitError;
    expect(isRetryableRateLimit(err)).toBe(true);
  });
});
