import { afterEach, describe, expect, it } from "vitest";
import { listMailAccountsTool } from "../../../src/tools/mail/listMailAccounts.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("list_mail_accounts", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /mail and returns accounts as JSON text", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { accounts: [{ mail_address: "a@example.com", quota_mb: 2000, memo: "x" }] },
    });
    restore = r;

    const tool = listMailAccountsTool();
    const ctx = makeContext();
    const result = await tool.handler({}, ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/mail");
    expect(calls[0]?.method).toBe("GET");
    expect(result.isError).toBeUndefined();
    const text = result.content[0]?.text ?? "";
    expect(JSON.parse(text)).toEqual({
      accounts: [{ mail_address: "a@example.com", quota_mb: 2000, memo: "x" }],
    });
  });

  it("passes domain query parameter when provided", async () => {
    const { calls, restore: r } = installFetchMock({ body: { accounts: [] } });
    restore = r;

    const tool = listMailAccountsTool();
    await tool.handler({ domain: "example.com" }, makeContext());

    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail?domain=example.com",
    );
  });

  it("returns isError on API 500", async () => {
    const { restore: r } = installFetchMock({ status: 500, body: { message: "boom" } });
    restore = r;

    const tool = listMailAccountsTool();
    const result = await tool.handler({}, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("boom");
  });

  it("normalizes IDN domain filter to ASCII", async () => {
    const { calls, restore: r } = installFetchMock({ body: { accounts: [] } });
    restore = r;

    const tool = listMailAccountsTool();
    await tool.handler({ domain: "例え.jp" }, makeContext());

    expect(calls[0]?.url).toContain("domain=xn--");
    expect(calls[0]?.url).not.toContain("%E4%BE%8B");
  });

  it("returns VALIDATION_ERROR for an empty-string domain", async () => {
    const tool = listMailAccountsTool();
    const result = await tool.handler({ domain: "   " }, makeContext());
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
