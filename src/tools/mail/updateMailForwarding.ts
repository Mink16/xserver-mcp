import { z } from "zod";
import { normalizeMailAddress } from "../domain.js";
import { encodeMailAccount, runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  mail_address: z
    .string()
    .min(1)
    .describe("対象のメールアドレス。日本語ドメインを含む形も指定可 (内部で ASCII 正規化)。"),
  forwarding_addresses: z
    .array(z.string())
    .describe(
      "転送先メールアドレスの配列。各要素の domain 部は日本語でも指定可 (内部で ASCII 正規化)。空配列を指定すると転送先をクリアする。",
    ),
  keep_in_mailbox: z
    .boolean()
    .optional()
    .describe("転送後もメールボックスに残すかどうか (省略時は変更しない)"),
};

export function updateMailForwardingTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "update_mail_forwarding",
    title: "Update mail forwarding settings",
    description:
      "指定メールアカウントの転送設定を上書きで更新する。forwarding_addresses に空配列を渡すと全てクリアされる。",
    inputSchema,
    annotations: { idempotentHint: true, openWorldHint: true },
    handler: async (args, { client, config }) =>
      runApi(async () => {
        const normalizedAddress = normalizeMailAddress(args.mail_address);
        const normalizedForwarding = args.forwarding_addresses.map(
          (addr) => normalizeMailAddress(addr).mail_address,
        );

        const body: Record<string, unknown> = {
          forwarding_addresses: normalizedForwarding,
        };
        if (args.keep_in_mailbox !== undefined) {
          body.keep_in_mailbox = args.keep_in_mailbox;
        }

        const response = await client.request({
          method: "PUT",
          path: `/v1/server/${config.servername}/mail/${encodeMailAccount(normalizedAddress.mail_address)}/forwarding`,
          body,
        });
        return {
          ...(response as Record<string, unknown>),
          resolved_mail_address: normalizedAddress.mail_address,
          resolved_domain: normalizedAddress.domain,
          resolved_forwarding_addresses: normalizedForwarding,
        };
      }, successResult),
  };
}
