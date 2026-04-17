import { createHttpClient } from "../../src/client/httpClient.js";
import type { XserverConfig } from "../../src/config.js";
import type { ToolContext } from "../../src/tools/types.js";

export const testConfig: XserverConfig = {
  apiKey: "test-key",
  servername: "sv.example",
  baseUrl: "https://api.xserver.ne.jp",
  http: {
    concurrency: 10,
    retry: { maxAttempts: 1, maxWaitSec: 10 },
  },
};

export function makeContext(overrides: Partial<XserverConfig> = {}): ToolContext {
  const config = { ...testConfig, ...overrides };
  return {
    client: createHttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      concurrency: config.http.concurrency,
      retry: config.http.retry,
    }),
    config,
  };
}
