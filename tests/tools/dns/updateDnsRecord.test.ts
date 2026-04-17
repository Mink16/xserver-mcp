import { afterEach, describe, expect, it } from "vitest";
import { updateDnsRecordTool } from "../../../src/tools/dns/updateDnsRecord.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("update_dns_record", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("PUTs /dns/{dns_id} with supplied fields only", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { message: "DNSレコードを更新しました" },
    });
    restore = r;

    const tool = updateDnsRecordTool();
    const result = await tool.handler(
      { dns_id: "4076702", content: "192.0.2.2", ttl: 7200 },
      makeContext(),
    );

    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/dns/4076702");
    expect(calls[0]?.body).toEqual({ content: "192.0.2.2", ttl: 7200 });
    expect(result.isError).toBeUndefined();
  });

  it("omits undefined fields from the request body", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateDnsRecordTool();
    await tool.handler({ dns_id: "1", priority: 20 }, makeContext());

    expect(calls[0]?.body).toEqual({ priority: 20 });
  });

  it("input schema rejects empty dns_id", () => {
    const tool = updateDnsRecordTool();
    expect(tool.inputSchema.dns_id.safeParse("").success).toBe(false);
    expect(tool.inputSchema.dns_id.safeParse("123").success).toBe(true);
  });

  it("returns isError on 422", async () => {
    const { restore: r } = installFetchMock({
      status: 422,
      body: { message: "invalid record" },
    });
    restore = r;

    const tool = updateDnsRecordTool();
    const result = await tool.handler({ dns_id: "1", content: "x" }, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("invalid record");
  });

  it("normalizes IDN domain and includes resolved_domain when domain is provided", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateDnsRecordTool();
    const result = await tool.handler(
      { dns_id: "42", domain: "例え.jp", content: "192.0.2.9" },
      makeContext(),
    );

    const sent = calls[0]?.body as { domain: string };
    expect(sent.domain.startsWith("xn--")).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_domain).toBe(sent.domain);
  });

  it("omits resolved_domain from the response when domain is not updated", async () => {
    const { restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateDnsRecordTool();
    const result = await tool.handler({ dns_id: "42", ttl: 3600 }, makeContext());
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_domain).toBeUndefined();
  });
});
