import { afterEach, describe, expect, it } from "vitest";
import { createDnsRecordTool } from "../../../src/tools/dns/createDnsRecord.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("create_dns_record", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("POSTs /dns with required fields only", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { id: 123, message: "DNSレコードを追加しました" },
    });
    restore = r;

    const tool = createDnsRecordTool();
    const result = await tool.handler(
      {
        domain: "example.com",
        host: "@",
        type: "A",
        content: "192.0.2.1",
      },
      makeContext(),
    );

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/dns");
    expect(calls[0]?.body).toEqual({
      domain: "example.com",
      host: "@",
      type: "A",
      content: "192.0.2.1",
    });
    expect(result.isError).toBeUndefined();
  });

  it("includes optional ttl and priority when provided", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { id: 456, message: "ok" },
    });
    restore = r;

    const tool = createDnsRecordTool();
    await tool.handler(
      {
        domain: "example.com",
        host: "@",
        type: "MX",
        content: "mx1.example.com",
        ttl: 7200,
        priority: 10,
      },
      makeContext(),
    );

    expect(calls[0]?.body).toEqual({
      domain: "example.com",
      host: "@",
      type: "MX",
      content: "mx1.example.com",
      ttl: 7200,
      priority: 10,
    });
  });

  it("input schema rejects unknown record type", () => {
    const tool = createDnsRecordTool();
    expect(tool.inputSchema.type.safeParse("FOO").success).toBe(false);
    expect(tool.inputSchema.type.safeParse("TXT").success).toBe(true);
  });

  it("input schema rejects ttl below 60", () => {
    const tool = createDnsRecordTool();
    expect(tool.inputSchema.ttl.safeParse(30).success).toBe(false);
    expect(tool.inputSchema.ttl.safeParse(3600).success).toBe(true);
  });

  it("returns isError on 422 validation failure", async () => {
    const { restore: r } = installFetchMock({
      status: 422,
      body: { message: "invalid content" },
    });
    restore = r;

    const tool = createDnsRecordTool();
    const result = await tool.handler(
      {
        domain: "example.com",
        host: "@",
        type: "A",
        content: "not-an-ip",
      },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("invalid content");
  });

  it("normalizes IDN domain to ASCII and echoes it as resolved_domain", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { id: 100, message: "added" },
    });
    restore = r;

    const tool = createDnsRecordTool();
    const result = await tool.handler(
      {
        domain: "例え.jp",
        host: "@",
        type: "A",
        content: "192.0.2.1",
      },
      makeContext(),
    );

    const sent = calls[0]?.body as { domain: string };
    expect(sent.domain.startsWith("xn--")).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_domain).toBe(sent.domain);
  });

  it("returns VALIDATION_ERROR for an invalid domain", async () => {
    const tool = createDnsRecordTool();
    const result = await tool.handler(
      { domain: "   ", host: "@", type: "A", content: "1.2.3.4" },
      makeContext(),
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
