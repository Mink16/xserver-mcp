import { XserverRateLimitError, errorFromResponse, isRetryableRateLimit } from "./errors.js";

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  concurrency: number;
  retry: {
    maxAttempts: number;
    maxWaitSec: number;
  };
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface HttpClient {
  request: <T = unknown>(options: RequestOptions) => Promise<T>;
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const acquire = createSemaphore(Math.max(1, config.concurrency));
  const maxAttempts = Math.max(1, config.retry.maxAttempts);
  const maxWaitSec = Math.max(0, config.retry.maxWaitSec);

  async function sendOnce<T>(options: RequestOptions): Promise<T> {
    const url = buildUrl(config.baseUrl, options.path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) {
      return null as T;
    }
    const text = await response.text();
    const parsed = text.length > 0 ? safeJsonParse(text) : null;
    if (!response.ok) {
      throw errorFromResponse(response.status, parsed, response.headers);
    }
    return parsed as T;
  }

  async function sendWithRetry<T>(options: RequestOptions): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        return await sendOnce<T>(options);
      } catch (err) {
        if (!shouldRetry(err, attempt, maxAttempts, maxWaitSec)) throw err;
        const waitSec = (err as XserverRateLimitError).retryAfterSeconds ?? 0;
        logRetry(options, attempt, waitSec);
        if (waitSec > 0) await sleep(waitSec * 1000);
      }
    }
  }

  return {
    async request<T = unknown>(options: RequestOptions): Promise<T> {
      const release = await acquire();
      try {
        return await sendWithRetry<T>(options);
      } finally {
        release();
      }
    },
  };
}

function shouldRetry(
  err: unknown,
  attempt: number,
  maxAttempts: number,
  maxWaitSec: number,
): err is XserverRateLimitError {
  if (!(err instanceof XserverRateLimitError)) return false;
  if (attempt >= maxAttempts) return false;
  if (!isRetryableRateLimit(err)) return false;
  const wait = err.retryAfterSeconds;
  if (wait === undefined) return false;
  return wait <= maxWaitSec;
}

function logRetry(options: RequestOptions, attempt: number, waitSec: number): void {
  console.error(
    `[xserver-mcp] 429 on ${options.method} ${options.path}: retrying after ${waitSec}s (attempt ${attempt})`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Release = () => void;
function createSemaphore(limit: number): () => Promise<Release> {
  let active = 0;
  const waiters: Array<() => void> = [];
  const release: Release = () => {
    active--;
    const next = waiters.shift();
    if (next) next();
  };
  return function acquire(): Promise<Release> {
    if (active < limit) {
      active++;
      return Promise.resolve(release);
    }
    return new Promise<Release>((resolve) => {
      waiters.push(() => {
        active++;
        resolve(release);
      });
    });
  };
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${trimmedBase}${normalizedPath}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs.length > 0 ? `${url}?${qs}` : url;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
