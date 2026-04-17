import { afterEach, describe, expect, it } from "vitest";
import { createMailAccountTool } from "../../../src/tools/mail/createMailAccount.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("create_mail_account", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("POSTs /mail with required body fields", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { mail_address: "info@example.com", message: "ok" },
    });
    restore = r;

    const tool = createMailAccountTool();
    const result = await tool.handler(
      {
        mail_address: "info@example.com",
        password: "Secret1234",
        quota_mb: 2000,
        memo: "問い合わせ",
      },
      makeContext(),
    );

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/mail");
    expect(calls[0]?.body).toEqual({
      mail_address: "info@example.com",
      password: "Secret1234",
      quota_mb: 2000,
      memo: "問い合わせ",
    });
    expect(result.isError).toBeUndefined();
  });

  it("omits optional fields when undefined", async () => {
    const { calls, restore: r } = installFetchMock({ body: { mail_address: "x@y.com" } });
    restore = r;

    const tool = createMailAccountTool();
    await tool.handler({ mail_address: "x@y.com", password: "abcdef" }, makeContext());

    expect(calls[0]?.body).toEqual({
      mail_address: "x@y.com",
      password: "abcdef",
    });
  });

  it("input schema rejects short password", () => {
    const tool = createMailAccountTool();
    const schema = tool.inputSchema;
    const result = schema.password.safeParse("12345");
    expect(result.success).toBe(false);
  });

  it("returns isError on 422 validation failure", async () => {
    const { restore: r } = installFetchMock({
      status: 422,
      body: { message: "invalid mail_address" },
    });
    restore = r;

    const tool = createMailAccountTool();
    const result = await tool.handler(
      { mail_address: "bad@example.com", password: "abcdef" },
      makeContext(),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("invalid mail_address");
  });

  it("normalizes IDN domain in mail_address to ASCII before sending", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { message: "created" },
    });
    restore = r;

    const tool = createMailAccountTool();
    const result = await tool.handler(
      { mail_address: "user@例え.jp", password: "Secret1234" },
      makeContext(),
    );

    expect(result.isError).toBeUndefined();
    const sent = calls[0]?.body as { mail_address: string };
    expect(sent.mail_address.startsWith("user@xn--")).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "");
    expect(parsed.resolved_mail_address).toBe(sent.mail_address);
    expect(parsed.resolved_domain.startsWith("xn--")).toBe(true);
  });

  it("returns VALIDATION_ERROR when mail_address is malformed", async () => {
    const tool = createMailAccountTool();
    const result = await tool.handler(
      { mail_address: "no-at-sign", password: "Secret1234" },
      makeContext(),
    );
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
