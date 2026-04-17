import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHttpClient } from "./client/httpClient.js";
import type { XserverConfig } from "./config.js";
import { buildToolList, parseEnabledToolsets } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";

export interface CreateServerOptions {
  config: XserverConfig;
  enableToolsets?: string;
  serverName?: string;
  serverVersion?: string;
}

export function createXserverMcpServer(options: CreateServerOptions): McpServer {
  const server = new McpServer(
    {
      name: options.serverName ?? "xserver-mcp-server",
      version: options.serverVersion ?? "0.1.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  const ctx: ToolContext = {
    client: createHttpClient({
      apiKey: options.config.apiKey,
      baseUrl: options.config.baseUrl,
      concurrency: options.config.http.concurrency,
      retry: options.config.http.retry,
    }),
    config: options.config,
  };

  const enabled = parseEnabledToolsets(options.enableToolsets);
  const tools = buildToolList(enabled);

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      async (args) => tool.handler(args as never, ctx),
    );
  }

  return server;
}
