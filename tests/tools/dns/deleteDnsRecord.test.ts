import { afterEach, describe, expect, it } from "vitest";
import { deleteDnsRecordTool } from "../../../src/tools/dns/deleteDnsRecord.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("delete_dns_record", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("DELETEs /dns/{dns_id} when confirm is true", async () => {
    const { calls, restore: r } = installFetchMock({
      body: { message: "DNSレコードを削除しました" },
    });
    restore = r;

    const tool = deleteDnsRecordTool();
    const result = await tool.handler({ dns_id: "4076702", confirm: true }, makeContext());

    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/dns/4076702");
    expect(result.isError).toBeUndefined();
  });

  it("annotations mark destructive", () => {
    const tool = deleteDnsRecordTool();
    expect(tool.annotations?.destructiveHint).toBe(true);
    expect(tool.annotations?.idempotentHint).toBe(true);
  });

  it("input schema rejects confirm !== true", () => {
    const tool = deleteDnsRecordTool();
    expect(tool.inputSchema.confirm.safeParse(false).success).toBe(false);
    expect(tool.inputSchema.confirm.safeParse(true).success).toBe(true);
  });

  it("returns isError on API error", async () => {
    const { restore: r } = installFetchMock({
      status: 422,
      body: { message: "no such record" },
    });
    restore = r;

    const tool = deleteDnsRecordTool();
    const result = await tool.handler({ dns_id: "404", confirm: true }, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("no such record");
  });
});
