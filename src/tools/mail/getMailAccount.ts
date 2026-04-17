import { z } from "zod";
import { normalizeMailAddress } from "../domain.js";
import { encodeMailAccount, runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe("対象のメールアドレス。日本語ドメインを含む形も指定可 (内部で ASCII 正規化)。"),
};

export function getMailAccountTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "get_mail_account",
    title: "Get mail account details",
    description: "指定したメールアカウントの詳細情報 (容量・使用量・メモ) を取得する。",
    inputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async ({ mail_address }, { client, config }) =>
      runApi(() => {
        const { mail_address: normalized } = normalizeMailAddress(mail_address);
        return client.request({
          method: "GET",
          path: `/v1/server/${config.servername}/mail/${encodeMailAccount(normalized)}`,
        });
      }),
  };
}
