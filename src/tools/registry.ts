import { dnsTools } from "./dns/index.js";
import { domainVerificationTools } from "./domainVerification/index.js";
import { mailTools } from "./mail/index.js";
import { serverTools } from "./server/index.js";
import type { AnyToolDefinition } from "./types.js";

export const toolsetNames = ["mail", "server", "dns", "domain_verification"] as const;
export type ToolsetName = (typeof toolsetNames)[number];

const builders: Record<ToolsetName, () => AnyToolDefinition[]> = {
  mail: mailTools,
  server: serverTools,
  dns: dnsTools,
  domain_verification: domainVerificationTools,
};

export function buildToolList(enabled: ReadonlySet<ToolsetName>): AnyToolDefinition[] {
  const all: AnyToolDefinition[] = [];
  for (const name of toolsetNames) {
    if (!enabled.has(name)) continue;
    all.push(...builders[name]());
  }
  return all;
}

export function parseEnabledToolsets(raw: string | undefined): Set<ToolsetName> {
  if (!raw || raw.trim().length === 0 || raw.trim().toLowerCase() === "all") {
    return new Set(toolsetNames);
  }
  const result = new Set<ToolsetName>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (trimmed === "") continue;
    if ((toolsetNames as readonly string[]).includes(trimmed)) {
      result.add(trimmed as ToolsetName);
    }
  }
  return result;
}
