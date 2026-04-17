import { afterEach, describe, expect, it } from "vitest";
import { deleteMailAccountTool } from "../../../src/tools/mail/deleteMailAccount.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("delete_mail_account", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("DELETEs /mail/{mail_account} when confirm is true", async () => {
    const { calls, restore: r } = installFetchMock({ body: { message: "deleted" } });
    restore = r;

    const tool = deleteMailAccountTool();
    const result = await tool.handler(
      { mail_address: "user@example.com", confirm: true },
      makeContext(),
    );

    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(
      "https://api.xserver.ne.jp/v1/server/sv.example/mail/user%40example.com",
    );
    expect(result.isError).toBeUndefined();
  });

  it("annotations mark destructive", () => {
    const tool = deleteMailAccountTool();
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  it("input schema rejects confirm !== true", () => {
    const tool = deleteMailAccountTool();
    expect(tool.inputSchema.confirm.safeParse(false).success).toBe(false);
    expect(tool.inputSchema.confirm.safeParse(true).success).toBe(true);
  });

  it("returns isError on API error", async () => {
    const { restore: r } = installFetchMock({ status: 422, body: { message: "no such" } });
    restore = r;
    const tool = deleteMailAccountTool();
    const result = await tool.handler({ mail_address: "x@y.com", confirm: true }, makeContext());
    expect(result.isError).toBe(true);
  });

  it("normalizes IDN mail_address before building the URL", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { message: "deleted" },
    });
    restore = r;

    const tool = deleteMailAccountTool();
    const result = await tool.handler(
      { mail_address: "user@例え.jp", confirm: true },
      makeContext(),
    );

    expect(result.isError).toBeUndefined();
    expect(calls[0]?.url).toMatch(/\/mail\/user%40xn--[a-z0-9-]+\.jp$/);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_mail_address.startsWith("user@xn--")).toBe(true);
  });
});
