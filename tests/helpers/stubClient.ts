import type { HttpClient, RequestOptions } from "../../src/client/httpClient.js";
import type { ToolContext } from "../../src/tools/types.js";
import { testConfig } from "./toolContext.js";

export type StubResponse<T = unknown> = { ok: true; value: T } | { ok: false; error: unknown };

export function ok<T>(value: T): StubResponse<T> {
  return { ok: true, value };
}

export function fail(error: unknown): StubResponse {
  return { ok: false, error };
}

export type StubEntry =
  | StubResponse
  | ((opt: RequestOptions) => StubResponse | Promise<StubResponse>);

export interface StubContext {
  ctx: ToolContext;
  calls: RequestOptions[];
  remaining: () => number;
}

export function makeStubContext(entries: StubEntry[]): StubContext {
  const calls: RequestOptions[] = [];
  let idx = 0;
  const client: HttpClient = {
    request: async <T>(options: RequestOptions) => {
      calls.push(options);
      const entry = entries[idx++];
      if (!entry) {
        throw new Error(
          `makeStubContext: unexpected extra request ${options.method} ${options.path}`,
        );
      }
      const resolved = typeof entry === "function" ? await entry(options) : entry;
      if (resolved.ok) return resolved.value as T;
      throw resolved.error;
    },
  };
  return {
    ctx: { client, config: testConfig },
    calls,
    remaining: () => entries.length - idx,
  };
}
