import type { z } from "zod";
import type { HttpClient } from "../client/httpClient.js";
import type { XserverConfig } from "../config.js";

export interface ToolContext {
  client: HttpClient;
  config: XserverConfig;
}

export interface ToolCallResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Shape;
  annotations?: ToolAnnotations;
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<ToolCallResult>;
}

export interface AnyToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodRawShape;
  annotations?: ToolAnnotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, ctx: ToolContext) => Promise<ToolCallResult>;
}
