import { z } from "zod";
import type { HttpClient } from "../../client/httpClient.js";
import type { XserverConfig } from "../../config.js";
import { toPunycodeDomain } from "../domain.js";
import { runApi } from "../helpers.js";
import type { ToolDefinition } from "../types.js";

export interface DnsRecord {
  id: number;
  domain: string;
  host: string;
  type: string;
  content: string;
  ttl?: number;
  priority?: number;
}

export interface EnsureDomainVerifiedResult {
  status: "already_verified" | "added";
  token: string;
  record_id: number;
  resolved_domain: string;
  added_at?: string;
}

export async function ensureDomainVerified(
  client: HttpClient,
  config: XserverConfig,
  domain: string,
): Promise<EnsureDomainVerifiedResult> {
  const info = await client.request<{ domain_validation_token: string }>({
    method: "GET",
    path: `/v1/server/${config.servername}/server-info`,
  });
  const token = info.domain_validation_token;
  const expectedContent = `xserver-verify=${token}`;

  const dns = await client.request<{ records?: DnsRecord[] }>({
    method: "GET",
    path: `/v1/server/${config.servername}/dns`,
    query: { domain },
  });
  const records = dns?.records ?? [];
  const fqdnHost = `_xserver-verify.${domain}`;
  const match = records.find(
    (r) =>
      r.type === "TXT" &&
      (r.host === "_xserver-verify" || r.host === fqdnHost) &&
      r.content === expectedContent,
  );
  if (match) {
    return {
      status: "already_verified",
      token,
      record_id: match.id,
      resolved_domain: domain,
    };
  }

  const created = await client.request<{ id: number; message: string }>({
    method: "POST",
    path: `/v1/server/${config.servername}/dns`,
    body: {
      domain,
      host: "_xserver-verify",
      type: "TXT",
      content: expectedContent,
      ttl: 3600,
    },
  });

  return {
    status: "added",
    token,
    record_id: created.id,
    resolved_domain: domain,
    added_at: new Date().toISOString(),
  };
}

const inputSchema = {
  domain: z
    .string()
    .min(1)
    .describe(
      "対象ドメイン。日本語ドメイン (IDN) も指定可 — 内部で ASCII (Punycode) に自動正規化される。",
    ),
};

export function ensureDomainVerifiedTool(): ToolDefinition<typeof inputSchema> {
  return {
    name: "ensure_domain_verified",
    title: "Ensure domain TXT verification",
    description:
      "`_xserver-verify.{domain}` の TXT レコードを現在の domain_validation_token と一致する状態に揃える。既に一致するレコードがあれば何もしない。DNS 伝播は待たない。レスポンスの resolved_domain は XServer に送信した ASCII 形式のドメイン。",
    inputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async ({ domain }, { client, config }) =>
      runApi(() => ensureDomainVerified(client, config, toPunycodeDomain(domain))),
  };
}
