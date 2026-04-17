import { getServerInfoTool } from "./getServerInfo.js";
import { getServerUsageTool } from "./getServerUsage.js";
import type { AnyToolDefinition } from "../types.js";

export function serverTools(): AnyToolDefinition[] {
  return [getServerInfoTool(), getServerUsageTool()];
}
