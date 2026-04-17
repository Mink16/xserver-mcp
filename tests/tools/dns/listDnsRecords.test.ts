import { afterEach, describe, expect, it } from "vitest";
import { listDnsRecordsTool } from "../../../src/tools/dns/listDnsRecords.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("list_dns_records", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /dns without domain when not provided", async () => {
    const payload = {
      records: [
        {
          id: 1,
          domain: "example.com",
          host: "@",
          type: "A",
          content: "192.0.2.1",
          ttl: 3600,
          priority: 0,
        },
      ],
    };
    const { calls, restore: r } = installFetchMock({ body: payload });
    restore = r;

    const tool = listDnsRecordsTool();
    const result = await tool.handler({}, makeContext());

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/dns");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(payload);
  });

  it("passes domain query parameter when provided", async () => {
    const { calls, restore: r } = installFetchMock({ body: { records: [] } });
    restore = r;

    const tool = listDnsRecordsTool();
    await tool.handler({ domain: "example.com" }, makeContext());

    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/dns?domain=example.com",
    );
  });

  it("returns isError on API 401", async () => {
    const { restore: r } = installFetchMock({
      status: 401,
      body: { message: "unauthorized" },
    });
    restore = r;

    const tool = listDnsRecordsTool();
    const result = await tool.handler({}, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("unauthorized");
  });

  it("normalizes IDN domain filter to ASCII", async () => {
    const { calls, restore: r } = installFetchMock({ body: { records: [] } });
    restore = r;

    const tool = listDnsRecordsTool();
    await tool.handler({ domain: "例え.jp" }, makeContext());

    expect(calls[0]?.url).toContain("domain=xn--");
  });
});
