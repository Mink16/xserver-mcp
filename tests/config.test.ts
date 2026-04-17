import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const ENV_KEYS = [
  "XSERVER_API_KEY",
  "XSERVER_SERVERNAME",
  "XSERVER_BASE_URL",
  "XSERVER_HTTP_CONCURRENCY",
  "XSERVER_HTTP_RETRY_MAX_ATTEMPTS",
  "XSERVER_HTTP_RETRY_MAX_WAIT_SEC",
] as const;

describe("loadConfig", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it("returns config with all required env vars present and HTTP defaults", () => {
    process.env.XSERVER_API_KEY = "secret-key";
    process.env.XSERVER_SERVERNAME = "sv12345.xserver.jp";

    const config = loadConfig();

    expect(config.apiKey).toBe("secret-key");
    expect(config.servername).toBe("sv12345.xserver.jp");
    expect(config.baseUrl).toBe("https://api.xserver.ne.jp");
    expect(config.http).toEqual({
      concurrency: 3,
      retry: { maxAttempts: 2, maxWaitSec: 10 },
    });
  });

  it("honors XSERVER_BASE_URL override", () => {
    process.env.XSERVER_API_KEY = "k";
    process.env.XSERVER_SERVERNAME = "sv.example";
    process.env.XSERVER_BASE_URL = "https://example.test";

    expect(loadConfig().baseUrl).toBe("https://example.test");
  });

  it("throws if XSERVER_API_KEY is missing", () => {
    process.env.XSERVER_SERVERNAME = "sv.example";
    expect(() => loadConfig()).toThrow(/XSERVER_API_KEY/);
  });

  it("throws if XSERVER_SERVERNAME is missing", () => {
    process.env.XSERVER_API_KEY = "k";
    expect(() => loadConfig()).toThrow(/XSERVER_SERVERNAME/);
  });

  it("throws if XSERVER_API_KEY is empty string", () => {
    process.env.XSERVER_API_KEY = "";
    process.env.XSERVER_SERVERNAME = "sv.example";
    expect(() => loadConfig()).toThrow(/XSERVER_API_KEY/);
  });

  describe("HTTP settings env overrides", () => {
    beforeEach(() => {
      process.env.XSERVER_API_KEY = "k";
      process.env.XSERVER_SERVERNAME = "sv.example";
    });

    it("applies XSERVER_HTTP_CONCURRENCY", () => {
      process.env.XSERVER_HTTP_CONCURRENCY = "7";
      expect(loadConfig().http.concurrency).toBe(7);
    });

    it("applies XSERVER_HTTP_RETRY_MAX_ATTEMPTS and XSERVER_HTTP_RETRY_MAX_WAIT_SEC", () => {
      process.env.XSERVER_HTTP_RETRY_MAX_ATTEMPTS = "5";
      process.env.XSERVER_HTTP_RETRY_MAX_WAIT_SEC = "30";
      expect(loadConfig().http.retry).toEqual({
        maxAttempts: 5,
        maxWaitSec: 30,
      });
    });

    it("falls back to defaults for non-numeric or invalid values", () => {
      process.env.XSERVER_HTTP_CONCURRENCY = "not-a-number";
      process.env.XSERVER_HTTP_RETRY_MAX_ATTEMPTS = "-1";
      process.env.XSERVER_HTTP_RETRY_MAX_WAIT_SEC = "1.5";
      const http = loadConfig().http;
      expect(http.concurrency).toBe(3);
      expect(http.retry.maxAttempts).toBe(2);
      expect(http.retry.maxWaitSec).toBe(10);
    });

    it("allows maxAttempts=1 (retry disabled) and maxWaitSec=0", () => {
      process.env.XSERVER_HTTP_RETRY_MAX_ATTEMPTS = "1";
      process.env.XSERVER_HTTP_RETRY_MAX_WAIT_SEC = "0";
      const http = loadConfig().http;
      expect(http.retry.maxAttempts).toBe(1);
      expect(http.retry.maxWaitSec).toBe(0);
    });
  });
});
