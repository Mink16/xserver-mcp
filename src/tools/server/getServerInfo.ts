import { runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

const inputSchema = {};

export function getServerInfoTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "get_server_info",
    title: "Get server info",
    description:
      "サーバーのスペック・ソフトウェアバージョン・ネームサーバー、およびドメイン所有権確認用の domain_validation_token を取得する。",
    inputSchema,
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (_args, { client, config }) =>
      runApi(() =>
        client.request({
          method: "GET",
          path: `/v1/server/${config.servername}/server-info`,
        }),
      ),
  };
}
