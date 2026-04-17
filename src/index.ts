#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createXserverMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createXserverMcpServer({
    config,
    enableToolsets: process.env.ENABLE_TOOLSETS,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`xserver-mcp-server failed to start: ${message}\n`);
  process.exit(1);
});
