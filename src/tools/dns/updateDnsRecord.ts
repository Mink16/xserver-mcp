import { z } from "zod";
import { toPunycodeDomain } from "../domain.js";
import { runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";
import { DNS_RECORD_TYPES } from "./createDnsRecord.js";

const inputSchema = {
  dns_id: z.string().min(1).describe("対象 DNS レコードの ID"),
  domain: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe(
      "ドメイン。日本語ドメイン (IDN) も指定可 — 内部で ASCII (Punycode) に自動正規化される。",
    ),
  host: z.string().min(1).max(255).optional().describe("ホスト名"),
  type: z.enum(DNS_RECORD_TYPES).optional().describe("レコードタイプ"),
  content: z.string().min(1).optional().describe("レコードの値"),
  ttl: z.number().int().min(60).max(86400).optional().describe("TTL 秒数 (60-86400)"),
  priority: z.number().int().min(0).optional().describe("MX/SRV レコードの優先度"),
};

export function updateDnsRecordTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "update_dns_record",
    title: "Update DNS record",
    description:
      "DNS レコードを部分更新する。送信した項目のみ上書きされ、省略した項目は現在の設定を維持する。domain を指定した場合はレスポンスに resolved_domain (ASCII 形式) が含まれる。",
    inputSchema,
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, { client, config }) =>
      runApi(async () => {
        const body: Record<string, unknown> = {};
        let resolvedDomain: string | undefined;
        if (args.domain !== undefined) {
          resolvedDomain = toPunycodeDomain(args.domain);
          body.domain = resolvedDomain;
        }
        if (args.host !== undefined) body.host = args.host;
        if (args.type !== undefined) body.type = args.type;
        if (args.content !== undefined) body.content = args.content;
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.priority !== undefined) body.priority = args.priority;

        const response = await client.request({
          method: "PUT",
          path: `/v1/server/${config.servername}/dns/${encodeURIComponent(args.dns_id)}`,
          body,
        });
        return {
          ...((response as Record<string, unknown> | null) ?? {}),
          ...(resolvedDomain !== undefined ? { resolved_domain: resolvedDomain } : {}),
        };
      }, successResult),
  };
}
