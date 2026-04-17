import { z } from "zod";
import { toPunycodeDomain } from "../domain.js";
import { runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  domain: z
    .string()
    .optional()
    .describe(
      "絞り込み対象のドメイン (省略時は全ドメイン)。日本語ドメイン (IDN) も指定可 — 内部で ASCII (Punycode) に自動正規化される。",
    ),
};

export function listMailAccountsTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "list_mail_accounts",
    title: "List mail accounts",
    description:
      "XServer に登録済みのメールアカウントを一覧取得する。domain を指定するとそのドメインのみに絞り込む。",
    inputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    handler: async ({ domain }, { client, config }) =>
      runApi(() =>
        client.request({
          method: "GET",
          path: `/v1/server/${config.servername}/mail`,
          query: {
            domain: domain !== undefined ? toPunycodeDomain(domain) : undefined,
          },
        }),
      ),
  };
}
