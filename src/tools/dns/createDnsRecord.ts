import { z } from "zod";
import { toPunycodeDomain } from "../domain.js";
import { runApi, successResult } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"] as const;

const inputSchema = {
  domain: z
    .string()
    .min(1)
    .max(253)
    .describe(
      "対象ドメイン。日本語ドメイン (IDN) も指定可 — 内部で ASCII (Punycode) に自動正規化される。",
    ),
  host: z.string().min(1).max(255).describe("ホスト名。`@` で apex を表す"),
  type: z.enum(DNS_RECORD_TYPES).describe("レコードタイプ"),
  content: z.string().min(1).describe("レコードの値"),
  ttl: z
    .number()
    .int()
    .min(60)
    .max(86400)
    .optional()
    .describe("TTL 秒数 (60-86400、省略時は XServer 側の既定値 3600)"),
  priority: z.number().int().min(0).optional().describe("MX/SRV レコードの優先度"),
};

export function createDnsRecordTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "create_dns_record",
    title: "Create DNS record",
    description:
      "DNS レコード (A / AAAA / CNAME / MX / TXT / SRV / CAA) を新規追加する。レスポンスの resolved_domain は XServer に送信した ASCII 形式のドメイン。",
    inputSchema,
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, { client, config }) =>
      runApi(async () => {
        const resolvedDomain = toPunycodeDomain(args.domain);
        const body: Record<string, unknown> = {
          domain: resolvedDomain,
          host: args.host,
          type: args.type,
          content: args.content,
        };
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.priority !== undefined) body.priority = args.priority;

        const response = await client.request({
          method: "POST",
          path: `/v1/server/${config.servername}/dns`,
          body,
        });
        return {
          ...(response as Record<string, unknown>),
          resolved_domain: resolvedDomain,
        };
      }, successResult),
  };
}
