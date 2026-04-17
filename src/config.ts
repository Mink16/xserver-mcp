import env from "env-var";

export interface HttpSettings {
  concurrency: number;
  retry: {
    maxAttempts: number;
    maxWaitSec: number;
  };
}

export interface XserverConfig {
  apiKey: string;
  servername: string;
  baseUrl: string;
  http: HttpSettings;
}

const DEFAULT_BASE_URL = "https://api.xserver.ne.jp";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_MAX_WAIT_SEC = 10;

export function loadConfig(): XserverConfig {
  return {
    apiKey: env.get("XSERVER_API_KEY").required().asString(),
    servername: env.get("XSERVER_SERVERNAME").required().asString(),
    baseUrl: env.get("XSERVER_BASE_URL").default(DEFAULT_BASE_URL).asString(),
    http: {
      concurrency: parsePositiveInt(process.env.XSERVER_HTTP_CONCURRENCY, DEFAULT_CONCURRENCY),
      retry: {
        maxAttempts: parsePositiveInt(
          process.env.XSERVER_HTTP_RETRY_MAX_ATTEMPTS,
          DEFAULT_RETRY_MAX_ATTEMPTS,
        ),
        maxWaitSec: parseNonNegativeInt(
          process.env.XSERVER_HTTP_RETRY_MAX_WAIT_SEC,
          DEFAULT_RETRY_MAX_WAIT_SEC,
        ),
      },
    },
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = toInt(raw);
  return n !== undefined && n >= 1 ? n : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = toInt(raw);
  return n !== undefined && n >= 0 ? n : fallback;
}

function toInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}
