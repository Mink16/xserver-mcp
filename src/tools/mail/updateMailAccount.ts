import { z } from "zod";
import { normalizeMailAddress } from "../domain.js";
import { encodeMailAccount, runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe("対象のメールアドレス。日本語ドメインを含む形も指定可 (内部で ASCII 正規化)。"),
  password: z.string().min(6).optional().describe("新しいパスワード (省略時は変更しない)"),
  quota_mb: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe("メールボックス容量 MB (省略時は変更しない)"),
  memo: z.string().optional().describe("新しいメモ (省略時は変更しない)"),
};

export function updateMailAccountTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "update_mail_account",
    title: "Update mail account",
    description: "メールアカウントの設定を部分更新する。省略したフィールドは現在値を維持する。",
    inputSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    handler: async (args, { client, config }) =>
      runApi(async () => {
        const normalized = normalizeMailAddress(args.mail_address);
        const body: Record<string, unknown> = {};
        if (args.password !== undefined) body.password = args.password;
        if (args.quota_mb !== undefined) body.quota_mb = args.quota_mb;
        if (args.memo !== undefined) body.memo = args.memo;

        const response = await client.request({
          method: "PUT",
          path: `/v1/server/${config.servername}/mail/${encodeMailAccount(normalized.mail_address)}`,
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
