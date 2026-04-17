import { parseRateLimitHeaders, parseRetryAfter, type RateLimitInfo } from "./rateLimit.js";

export type XserverErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "OPERATION_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR"
  | "BACKEND_ERROR"
  | "API_ERROR";

const STATUS_TO_CODE: Record<number, XserverErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "OPERATION_ERROR",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMIT_EXCEEDED",
  500: "INTERNAL_ERROR",
  502: "BACKEND_ERROR",
};

export function errorCodeFromStatus(status: number): XserverErrorCode {
  return STATUS_TO_CODE[status] ?? "API_ERROR";
}

export interface XserverApiErrorInit {
  status: number;
  code: string;
  body: unknown;
  errors?: readonly string[];
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
}

export class XserverApiError extends Error {
  override readonly name: string = "XserverApiError";
  readonly status: number;
  readonly code: string;
  readonly body: unknown;
  readonly errors: readonly string[];
  readonly rateLimit?: RateLimitInfo;
  readonly retryAfterSeconds?: number;

  constructor(message: string, init: XserverApiErrorInit) {
    super(message);
    this.status = init.status;
    this.code = init.code;
    this.body = init.body;
    this.errors = init.errors ?? [];
    this.rateLimit = init.rateLimit;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export class XserverAuthError extends XserverApiError {
  override readonly name = "XserverAuthError";
}
export class XserverForbiddenError extends XserverApiError {
  override readonly name = "XserverForbiddenError";
}
export class XserverNotFoundError extends XserverApiError {
  override readonly name = "XserverNotFoundError";
}
export class XserverOperationError extends XserverApiError {
  override readonly name = "XserverOperationError";
}
export class XserverValidationError extends XserverApiError {
  override readonly name = "XserverValidationError";
}
export class XserverRateLimitError extends XserverApiError {
  override readonly name = "XserverRateLimitError";
}
export class XserverServerError extends XserverApiError {
  override readonly name = "XserverServerError";
}

const STATUS_CLASS: Record<
  number,
  new (message: string, init: XserverApiErrorInit) => XserverApiError
> = {
  401: XserverAuthError,
  403: XserverForbiddenError,
  404: XserverNotFoundError,
  409: XserverOperationError,
  422: XserverValidationError,
  429: XserverRateLimitError,
  500: XserverServerError,
  502: XserverServerError,
};

export function errorFromResponse(
  status: number,
  body: unknown,
  headers: Headers,
): XserverApiError {
  const parsed = extractErrorFields(body);
  const code = parsed.code ?? errorCodeFromStatus(status);
  const message = parsed.message ?? `XServer API error (status ${status})`;
  const init: XserverApiErrorInit = {
    status,
    code,
    body,
    errors: parsed.errors,
  };
  if (status === 429) {
    init.rateLimit = parseRateLimitHeaders(headers);
    init.retryAfterSeconds = parseRetryAfter(headers);
  }
  const Klass = STATUS_CLASS[status] ?? XserverApiError;
  return new Klass(message, init);
}

export function isRetryableRateLimit(err: XserverRateLimitError): boolean {
  // Concurrent-limit 429 は他の in-flight が捌けるまで解消しないので、
  // 単純な時間待ちリトライでは雪崩を起こすだけ。対象外にする。
  return err.rateLimit?.concurrentRemaining !== 0;
}

interface ParsedErrorFields {
  code?: string;
  message?: string;
  errors: readonly string[];
}

function extractErrorFields(body: unknown): ParsedErrorFields {
  if (!isRecord(body)) {
    return { errors: [] };
  }
  const errorField = body.error;
  if (isRecord(errorField)) {
    return {
      code: stringOrUndefined(errorField.code),
      message: stringOrUndefined(errorField.message),
      errors: normalizeErrorArray(errorField.errors),
    };
  }
  return {
    message: stringOrUndefined(body.message),
    errors: normalizeErrorArray(body.errors),
  };
}

function normalizeErrorArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : safeStringify(item)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
