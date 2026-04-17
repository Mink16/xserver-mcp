import { afterEach, describe, expect, it } from "vitest";
import { getServerUsageTool } from "../../../src/tools/server/getServerUsage.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("get_server_usage", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /server-info/usage", async () => {
    const payload = {
      disk: { quota_gb: 300, used_gb: 12.3, file_limit: 0, file_count: 10 },
      counts: {
        domains: 1,
        subdomains: 0,
        mail_accounts: 3,
        ftp_accounts: 0,
        mysql_databases: 1,
      },
    };
    const { calls, restore: r } = installFetchMock({ body: payload });
    restore = r;

    const tool = getServerUsageTool();
    const result = await tool.handler({}, makeContext());

    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/server-info/usage");
    expect(calls[0]?.method).toBe("GET");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(payload);
  });

  it("returns isError on API 500", async () => {
    const { restore: r } = installFetchMock({
      status: 500,
      body: { message: "boom" },
    });
    restore = r;

    const tool = getServerUsageTool();
    const result = await tool.handler({}, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("boom");
  });
});
