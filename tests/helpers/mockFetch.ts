import { vi, type Mock } from "vitest";

export type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

export type MockResponseInit = {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
};

export type MockFetchInit = MockResponseInit & {
  queue?: MockResponseInit[];
};

export function installFetchMock(init: MockFetchInit = {}): {
  mock: Mock;
  calls: FetchCall[];
  restore: () => void;
  activeCount: () => number;
  maxActive: () => number;
} {
  const calls: FetchCall[] = [];
  const queue: MockResponseInit[] = init.queue ? [...init.queue] : [];
  const fallback: MockResponseInit = init.queue
    ? {}
    : {
        status: init.status,
        body: init.body,
        text: init.text,
        headers: init.headers,
      };
  const original = globalThis.fetch;

  let active = 0;
  let maxActive = 0;

  const mock = vi.fn(async (input: RequestInfo | URL, initArg?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (initArg?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (initArg?.headers) {
      const h = initArg.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) headers[k] = String(v);
    }
    let body: unknown = undefined;
    if (initArg?.body) {
      try {
        body = JSON.parse(initArg.body as string);
      } catch {
        body = initArg.body;
      }
    }
    calls.push({ url, method, headers, body });

    active++;
    if (active > maxActive) maxActive = active;

    try {
      const next = queue.length > 0 ? queue.shift()! : fallback;
      // Simulate async I/O so that concurrency can be observed in tests.
      await Promise.resolve();
      const status = next.status ?? 200;
      const text = next.text ?? (next.body !== undefined ? JSON.stringify(next.body) : "");
      const bodyInit = status === 204 || status === 205 || status === 304 ? null : text;
      const responseHeaders: Record<string, string> = {
        "content-type": "application/json",
        ...(next.headers ?? {}),
      };
      return new Response(bodyInit, {
        status,
        headers: responseHeaders,
      });
    } finally {
      active--;
    }
  });

  (globalThis as { fetch: typeof fetch }).fetch = mock as unknown as typeof fetch;

  return {
    mock,
    calls,
    restore: () => {
      (globalThis as { fetch: typeof fetch }).fetch = original;
    },
    activeCount: () => active,
    maxActive: () => maxActive,
  };
}
