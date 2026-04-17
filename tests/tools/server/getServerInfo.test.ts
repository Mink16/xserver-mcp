import { afterEach, describe, expect, it } from "vitest";
import { getServerInfoTool } from "../../../src/tools/server/getServerInfo.js";
import { installFetchMock } from "../../helpers/mockFetch.js";
import { makeContext } from "../../helpers/toolContext.js";

describe("get_server_info", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("GETs /server-info and returns JSON body", async () => {
    const payload = {
      server_id: "xs123456",
      hostname: "sv12345.xserver.jp",
      ip_address: "192.0.2.1",
      os: "Linux",
      cpu: "Xeon",
      memory: "1024GB",
      apache_version: "2.4.x",
      perl_versions: ["5.30"],
      php_versions: ["8.2.x"],
      db_versions: ["mariadb10.5.x"],
      name_servers: ["ns1.xserver.jp", "ns2.xserver.jp"],
      domain_validation_token: "abcd1234",
    };
    const { calls, restore: r } = installFetchMock({ body: payload });
    restore = r;

    const tool = getServerInfoTool();
    const result = await tool.handler({}, makeContext());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://api.xserver.ne.jp/v1/server/sv.example/server-info");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(payload);
  });

  it("marks tool as readOnly / openWorld", () => {
    const tool = getServerInfoTool();
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(true);
  });

  it("returns isError on API 401", async () => {
    const { restore: r } = installFetchMock({
      status: 401,
      body: { message: "unauthorized" },
    });
    restore = r;

    const tool = getServerInfoTool();
    const result = await tool.handler({}, makeContext());

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("unauthorized");
  });
});
