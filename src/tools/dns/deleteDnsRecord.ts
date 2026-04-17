import { z } from "zod";
import { runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {
  dns_id: z.string().min(1).describe("削除する DNS レコードの ID"),
  confirm: z.literal(true).describe("破壊的操作への明示的な同意。必ず true を指定する。"),
};

export function deleteDnsRecordTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "delete_dns_record",
    title: "Delete DNS record",
    description: "DNS レコードを削除する。元に戻せないため、confirm=true を必須とする。",
    inputSchema,
    annotations: {
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async ({ dns_id }, { client, config }) =>
      runApi(() =>
        client.request({
          method: "DELETE",
          path: `/v1/server/${config.servername}/dns/${encodeURIComponent(dns_id)}`,
        }),
      ),
  };
}
