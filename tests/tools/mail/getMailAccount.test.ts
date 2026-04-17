import { afterEach, describe, expect, it } from "vitest";
import { getMailAccountTool } from "../../../src/tools/mail/getMailAccount.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("get_mail_account", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /mail/{mail_account} with URL-encoded address", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { mail_address: "user@example.com", quota_mb: 1000, used_mb: 12.5, memo: "" },
    });
    restore = r;

    const tool = getMailAccountTool();
    const result = await tool.handler({ mail_address: "user@example.com" }, makeContext());

    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail/user%40example.com",
    );
    expect(calls[0]?.method).toBe("GET");
    expect(result.isError).toBeUndefined();
  });

  it("returns isError on 401", async () => {
    const { restore: r } = installFetchMock({ status: 401, body: { message: "no" } });
    restore = r;
    const tool = getMailAccountTool();
    const result = await tool.handler({ mail_address: "x@y.com" }, makeContext());
    expect(result.isError).toBe(true);
  });

  it("normalizes IDN mail_address to ASCII before building the URL", async () => {
    const { calls, restore: r } = installFetchMock({ body: {} });
    restore = r;

    const tool = getMailAccountTool();
    await tool.handler({ mail_address: "user@例え.jp" }, makeContext());

    expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp$/);
  });
});
