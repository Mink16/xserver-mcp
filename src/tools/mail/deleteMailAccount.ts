import { z } from "zod";
import { normalizeMailAddress } from "../domain.js";
import { encodeMailAccount, runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe("削除するメールアドレス。日本語ドメインを含む形も指定可 (内部で ASCII 正規化)。"),
  confirm: z.literal(true).describe("破壊的操作への明示的な同意。必ず true を指定する。"),
};

export function deleteMailAccountTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "delete_mail_account",
    title: "Delete mail account",
    description: "メールアカウントを削除する。元に戻せないため、confirm=true を必須とする。",
    inputSchema,
    annotations: {
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async ({ mail_address }, { client, config }) =>
      runApi(async () => {
        const normalized = normalizeMailAddress(mail_address);
        const response = await client.request({
          method: "DELETE",
          path: `/v1/server/${config.servername}/mail/${encodeMailAccount(normalized.mail_address)}`,
        });
        return {
          ...((response as Record<string, unknown> | null) ?? {}),
          resolved_mail_address: normalized.mail_address,
          resolved_domain: normalized.domain,
        };
      }, successResult),
  };
}
