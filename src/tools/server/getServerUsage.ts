import { runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {};

export function getServerUsageTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "get_server_usage",
    title: "Get server usage",
    description:
      "ディスク使用量・ファイル数・各種リソース設定件数（ドメイン数・メール数・MySQL 数など）を取得する。",
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (_args, { client, config }) =>
      runApi(() =>
        client.request({
          method: "GET",
          path: `/v1/server/${config.servername}/server-info/usage`,
        }),
      ),
  };
}
