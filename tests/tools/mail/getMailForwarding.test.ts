import { afterEach, describe, expect, it } from "vitest";
import { getMailForwardingTool } from "../../../src/tools/mail/getMailForwarding.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("get_mail_forwarding", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /mail/{mail_account}/forwarding", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { forwarding_addresses: ["dest@example.com"], keep_in_mailbox: true },
    });
    restore = r;

    const tool = getMailForwardingTool();
    const result = await tool.handler({ mail_address: "u@e.com" }, makeContext());

    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail/u%40e.com/forwarding",
    );
    expect(result.isError).toBeUndefined();
  });

  it("returns isError on 401", async () => {
    const { restore: r } = installFetchMock({ status: 401, body: { message: "no" } });
    restore = r;
    const tool = getMailForwardingTool();
    const result = await tool.handler({ mail_address: "u@e.com" }, makeContext());
    expect(result.isError).toBe(true);
  });

  it("normalizes IDN mail_address before building the URL", async () => {
    const { calls, restore: r } = installFetchMock({ body: {} });
    restore = r;

    const tool = getMailForwardingTool();
    await tool.handler({ mail_address: "user@例え.jp" }, makeContext());

    expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp\/forwarding$/);
  });
});
