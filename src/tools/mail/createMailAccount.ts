import { z } from "zod";
import { normalizeMailAddress } from "../domain.js";
import { runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe(
      "作成するメールアドレス。日本語ドメインを含む形 (例: `info@日本.jp`) も指定可 — 内部で ASCII に自動正規化される。",
    ),
  password: z.string().min(6).describe("メールアカウントのパスワード (6 文字以上)"),
  quota_mb: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe("メールボックス容量 (MB。1-50000)"),
  memo: z.string().optional().describe("任意のメモ"),
};

export function createMailAccountTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "create_mail_account",
    title: "Create mail account",
    description:
      "新規メールアカウントを作成する。作成時にドメイン所有権の確認 (TXT レコード検証) が自動で実施される。レスポンスの resolved_mail_address / resolved_domain は XServer に送信した ASCII 形式。",
    inputSchema,
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async (args, { client, config }) =>
      runApi(async () => {
        const normalized = normalizeMailAddress(args.mail_address);
        const body: Record<string, unknown> = {
          mail_address: normalized.mail_address,
          password: args.password,
        };
        if (args.quota_mb !== undefined) body.quota_mb = args.quota_mb;
        if (args.memo !== undefined) body.memo = args.memo;

        const response = await client.request({
          method: "POST",
          path: `/v1/server/${config.servername}/mail`,
          body,
        });
        return {
          ...(response as Record<string, unknown>),
          resolved_mail_address: normalized.mail_address,
          resolved_domain: normalized.domain,
        };
      }, successResult),
  };
}
