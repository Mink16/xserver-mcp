import { XserverApiError } from "../client/errors.js";
import { DomainValidationError } from "./domain.js";
import type { ToolCallResult } from "./types.js";

export function successResult(data: unknown): ToolCallResult {
  return {
    content: [
      {
        type: "text",
        text: data === null ? "" : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResult(message: string, detail?: unknown): ToolCallResult {
  const payload = { error: message, ...(detail !== undefined ? { detail } : {}) };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

export function normalizedErrorResult(
  code: string,
  message: string,
  detail?: unknown,
): ToolCallResult {
  const payload = {
    error: message,
    code,
    ...(detail !== undefined ? { detail } : {}),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

export function mapErrorToNormalizedResult(err: unknown): ToolCallResult {
  if (err instanceof DomainValidationError) {
    return normalizedErrorResult("VALIDATION_ERROR", err.message, {
      input: err.input,
    });
  }
  if (err instanceof XserverApiError) {
    return normalizedErrorResult(err.code, `${err.name}: ${err.message}`, buildApiErrorDetail(err));
  }
  if (err instanceof Error) {
    return errorResult(err.message);
  }
  return errorResult("Unknown error");
}

export async function runApi<T>(
  run: () => Promise<T>,
  formatSuccess: (value: T) => ToolCallResult = successResult,
): Promise<ToolCallResult> {
  try {
    const value = await run();
    return formatSuccess(value);
  } catch (err) {
    return mapErrorToNormalizedResult(err);
  }
}

export function encodeMailAccount(mailAddress: string): string {
  return encodeURIComponent(mailAddress);
}

function buildApiErrorDetail(err: XserverApiError): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    status: err.status,
    body: err.body,
  };
  if (err.errors.length > 0) detail.errors = err.errors;
  if (err.retryAfterSeconds !== undefined) {
    detail.retry_after_seconds = err.retryAfterSeconds;
  }
  if (err.rateLimit !== undefined) detail.rate_limit = err.rateLimit;
  return detail;
}
