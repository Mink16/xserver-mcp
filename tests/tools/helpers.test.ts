import { describe, expect, it } from "vitest";
import { errorFromResponse } from "../../src/client/errors.js";
import { DomainValidationError } from "../../src/tools/domain.js";
import { mapErrorToNormalizedResult, runApi } from "../../src/tools/helpers.js";

function H(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

function parsedDetail(result: { content: Array<{ text?: string }> }): {
  error: string;
  code: string;
  detail?: Record<string, unknown>;
} {
  return JSON.parse(result.content[0]?.text ?? "");
}

describe("mapErrorToNormalizedResult", () => {
  it("wraps DomainValidationError as VALIDATION_ERROR", () => {
    const err = new DomainValidationError("bad mail", "foo@@bar");
    const result = mapErrorToNormalizedResult(err);
    expect(result.isError).toBe(true);
    const body = parsedDetail(result);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.detail).toEqual({ input: "foo@@bar" });
  });

  it("uses XserverApiError.code for XServer errors", () => {
    const err = errorFromResponse(
      422,
      { error: { code: "VALIDATION_ERROR", message: "bad", errors: ["x"] } },
      H(),
    );
    const body = parsedDetail(mapErrorToNormalizedResult(err));
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toMatch(/^XserverValidationError: /);
    expect(body.detail?.status).toBe(422);
    expect(body.detail?.errors).toEqual(["x"]);
  });

  it("maps status-to-code for legacy body without error.code (500)", () => {
    const err = errorFromResponse(500, { message: "boom" }, H());
    const body = parsedDetail(mapErrorToNormalizedResult(err));
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBe("XserverServerError: boom");
  });

  it("includes retry_after_seconds and rate_limit for 429 only", () => {
    const err = errorFromResponse(
      429,
      { error: { code: "RATE_LIMIT_EXCEEDED", message: "slow" } },
      H({
        "Retry-After": "3",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Concurrent-Remaining": "2",
      }),
    );
    const body = parsedDetail(mapErrorToNormalizedResult(err));
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.detail?.retry_after_seconds).toBe(3);
    expect(body.detail?.rate_limit).toEqual({
      remaining: 0,
      concurrentRemaining: 2,
    });
  });

  it("omits errors/rate_limit/retry_after_seconds when absent", () => {
    const err = errorFromResponse(409, { message: "conflict" }, H());
    const body = parsedDetail(mapErrorToNormalizedResult(err));
    expect(body.code).toBe("OPERATION_ERROR");
    expect(body.detail).toBeDefined();
    expect(body.detail).not.toHaveProperty("errors");
    expect(body.detail).not.toHaveProperty("retry_after_seconds");
    expect(body.detail).not.toHaveProperty("rate_limit");
  });

  it("falls back to generic error for unknown error types", () => {
    const result = mapErrorToNormalizedResult(new Error("oops"));
    const body = parsedDetail(result);
    expect(body.error).toBe("oops");
    expect(body.code).toBeUndefined();
  });

  it("falls back for non-Error thrown values", () => {
    const result = mapErrorToNormalizedResult("string-thrown");
    const body = parsedDetail(result);
    expect(body.error).toBe("Unknown error");
  });
});

describe("runApi delegates to mapErrorToNormalizedResult on failure", () => {
  it("returns successResult on success", async () => {
    const result = await runApi(async () => ({ ok: true }));
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({ ok: true });
  });

  it("normalizes XserverApiError with code", async () => {
    const err = errorFromResponse(403, { error: { code: "FORBIDDEN", message: "nope" } }, H());
    const result = await runApi(async () => {
      throw err;
    });
    expect(result.isError).toBe(true);
    const body = parsedDetail(result);
    expect(body.code).toBe("FORBIDDEN");
    expect(body.detail?.status).toBe(403);
  });
});
