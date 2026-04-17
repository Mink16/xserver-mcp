import { z } from "zod";
import { XserverApiError, XserverOperationError } from "../../client/errors.js";
import { DomainValidationError, normalizeMailAddress } from "../domain.js";
import { mapErrorToNormalizedResult, normalizedErrorResult, successResult } from "../helpers.js";
import type { ToolCallResult, ToolDefinition } from "../types.js";
import { ensureDomainVerified } from "./ensureDomainVerified.js";

const DEFAULT_WAIT_MS = 90_000;
const MAX_WAIT_MS = 300_000;
const DEFAULT_POLL_MS = 30_000;

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe(
      "作成するメールアドレス (`local@domain` 形式)。日本語ドメインを含む形 (例: `user@日本.jp`) も指定可 — 内部で ASCII に正規化される。",
    ),
  password: z.string().min(6).describe("メールアカウントのパスワード (6 文字以上)"),
  quota_mb: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe("メールボックス容量 MB (1-50000)"),
  memo: z.string().optional().describe("任意のメモ"),
  verification_wait_ms: z
    .number()
    .int()
    .min(0)
    .max(MAX_WAIT_MS)
    .optional()
    .describe(
      `ドメイン認証後の DNS 伝播待ち合計上限 (ms)。既定 ${DEFAULT_WAIT_MS}、最大 ${MAX_WAIT_MS}`,
    ),
  poll_interval_ms: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(`POST /mail 失敗時のリトライ間隔 (ms)。既定 ${DEFAULT_POLL_MS}`),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVerificationError(err: unknown): boolean {
  if (!(err instanceof XserverOperationError)) return false;
  const haystack = [err.message, ...err.errors].join(" ");
  return haystack.includes("TXTレコードによるドメイン認証");
}

function describeError(err: unknown): unknown {
  if (err instanceof XserverApiError) {
    return {
      name: err.name,
      status: err.status,
      code: err.code,
      message: err.message,
      body: err.body,
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { value: String(err) };
}

export function createMailAccountWithVerificationTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "create_mail_account_with_verification",
    title: "Create mail account with domain verification",
    description:
      "メールアカウントの作成に必要な TXT 認証と DNS 伝播待ちを内包した高レベルツール。既存確認 → ensure_domain_verified → POST /mail (最大 verification_wait_ms ぶんリトライ) を自動実行する。日本語ドメインの入力も受け付ける (内部で ASCII に正規化)。",
    inputSchema,
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, { client, config }) => {
      let normalized: ReturnType<typeof normalizeMailAddress>;
      try {
        normalized = normalizeMailAddress(args.mail_address);
      } catch (err) {
        if (err instanceof DomainValidationError) {
          return mapErrorToNormalizedResult(err);
        }
        throw err;
      }

      const waitMs = args.verification_wait_ms ?? DEFAULT_WAIT_MS;
      const pollMs = args.poll_interval_ms ?? DEFAULT_POLL_MS;
      const maxAttempts = Math.max(1, Math.floor(waitMs / pollMs));

      try {
        const list = await client.request<{
          accounts?: Array<{ mail_address: string }>;
        }>({
          method: "GET",
          path: `/v1/server/${config.servername}/mail`,
          query: { domain: normalized.domain },
        });
        const accounts = list?.accounts ?? [];
        if (accounts.some((a) => a.mail_address === normalized.mail_address)) {
          return alreadyExistsResult(args.mail_address, normalized);
        }

        const verification = await ensureDomainVerified(client, config, normalized.domain);

        const body: Record<string, unknown> = {
          mail_address: normalized.mail_address,
          password: args.password,
        };
        if (args.quota_mb !== undefined) body.quota_mb = args.quota_mb;
        if (args.memo !== undefined) body.memo = args.memo;

        let attempts = 0;
        let lastError: unknown;
        while (attempts < maxAttempts) {
          attempts++;
          try {
            const mail = await client.request<{ message: string }>({
              method: "POST",
              path: `/v1/server/${config.servername}/mail`,
              body,
            });
            return successResult({
              mail_address: args.mail_address,
              resolved_mail_address: normalized.mail_address,
              resolved_domain: normalized.domain,
              verification,
              mail,
            });
          } catch (err) {
            lastError = err;
            if (!isVerificationError(err)) {
              return mapErrorToNormalizedResult(err);
            }
            if (attempts < maxAttempts) {
              await sleep(pollMs);
            }
          }
        }

        return normalizedErrorResult(
          "DOMAIN_VERIFICATION_TIMEOUT",
          "Domain verification did not propagate within verification_wait_ms",
          {
            record_id: verification.record_id,
            token: verification.token,
            resolved_domain: normalized.domain,
            attempts,
            last_error: describeError(lastError),
          },
        );
      } catch (err) {
        return mapErrorToNormalizedResult(err);
      }
    },
  };
}

function alreadyExistsResult(
  rawMailAddress: string,
  normalized: ReturnType<typeof normalizeMailAddress>,
): ToolCallResult {
  return normalizedErrorResult(
    "ALREADY_EXISTS",
    `mail_address already exists: ${normalized.mail_address}`,
    {
      mail_address: rawMailAddress,
      resolved_mail_address: normalized.mail_address,
      resolved_domain: normalized.domain,
    },
  );
}
