import { afterEach, describe, expect, it } from "vitest";
import { updateMailAccountTool } from "../../../src/tools/mail/updateMailAccount.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("update_mail_account", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("PUTs only provided fields", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateMailAccountTool();
    await tool.handler({ mail_address: "user@example.com", quota_mb: 3000 }, makeContext());

    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail/user%40example.com",
    );
    expect(calls[0]?.body).toEqual({ quota_mb: 3000 });
  });

  it("sends multiple fields together", async () => {
    const { calls, restore: r } = installFetchMock({ body: {} });
    restore = r;

    const tool = updateMailAccountTool();
    await tool.handler(
      { mail_address: "u@e.com", password: "NewPass42", memo: "営業" },
      makeContext(),
    );

    expect(calls[0]?.body).toEqual({ password: "NewPass42", memo: "営業" });
  });

  it("returns isError on 422", async () => {
    const { restore: r } = installFetchMock({ status: 422, body: { message: "bad" } });
    restore = r;
    const tool = updateMailAccountTool();
    const result = await tool.handler({ mail_address: "u@e.com", memo: "x" }, makeContext());
    expect(result.isError).toBe(true);
  });

  it("normalizes IDN mail_address and exposes resolved_* in response", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "ok" } });
    restore = r;

    const tool = updateMailAccountTool();
    const result = await tool.handler({ mail_address: "user@例え.jp", memo: "n" }, makeContext());

    expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp$/);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_mail_address.startsWith("user@xn--")).toBe(true);
    expect(body.resolved_domain.startsWith("xn--")).toBe(true);
  });
});
