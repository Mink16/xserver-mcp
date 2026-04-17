import { afterEach, describe, expect, it } from "vitest";
import { updateMailForwardingTool } from "../../../src/tools/mail/updateMailForwarding.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("update_mail_forwarding", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("PUTs new forwarding addresses and keep_in_mailbox flag", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateMailForwardingTool();
    await tool.handler(
      {
        mail_address: "u@e.com",
        forwarding_addresses: ["a@x.com", "b@x.com"],
        keep_in_mailbox: true,
      },
      makeContext(),
    );

    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail/u%40e.com/forwarding",
    );
    expect(calls[0]?.body).toEqual({
      forwarding_addresses: ["a@x.com", "b@x.com"],
      keep_in_mailbox: true,
    });
  });

  it("allows clearing forwarding with empty array", async () => {
    const { calls, restore: r } = installFetchMock({ body: {} });
    restore = r;

    const tool = updateMailForwardingTool();
    await tool.handler({ mail_address: "u@e.com", forwarding_addresses: [] }, makeContext());

    expect(calls[0]?.body).toEqual({ forwarding_addresses: [] });
  });

  it("returns isError on 422", async () => {
    const { restore: r } = installFetchMock({ status: 422, body: { message: "bad addr" } });
    restore = r;
    const tool = updateMailForwardingTool();
    const result = await tool.handler(
      { mail_address: "u@e.com", forwarding_addresses: ["a@e.com"] },
      makeContext(),
    );
    expect(result.isError).toBe(true);
  });

  it("normalizes IDN mail_address and each forwarding address", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateMailForwardingTool();
    const result = await tool.handler(
      {
        mail_address: "user@例え.jp",
        forwarding_addresses: ["dest@例え.jp", "plain@example.com"],
      },
      makeContext(),
    );

    expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp\/forwarding$/);
    const sent = calls[0]?.body as { forwarding_addresses: string[] };
    expect(sent.forwarding_addresses[0]?.startsWith("dest@xn--")).toBe(true);
    expect(sent.forwarding_addresses[1]).toBe("plain@example.com");

    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_mail_address.startsWith("user@xn--")).toBe(true);
    expect(body.resolved_forwarding_addresses).toHaveLength(2);
  });

  it("returns VALIDATION_ERROR when a forwarding address is malformed", async () => {
    const tool = updateMailForwardingTool();
    const result = await tool.handler(
      { mail_address: "u@e.com", forwarding_addresses: ["no-at-sign"] },
      makeContext(),
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
