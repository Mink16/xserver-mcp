import { domainToASCII } from "node:url";
import { describe, expect, it } from "vitest";
import { XserverApiError } from "../../../src/client/errors.js";
import { ensureDomainVerifiedTool } from "../../../src/tools/domainVerification/ensureDomainVerified.js";
import { fail, makeStubContext, ok } from "../../helpers/stubClient.js";

describe("ensure_domain_verified", () => {
  it("returns already_verified when a matching TXT record already exists", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ domain_validation_token: "TOK123" }),
      ok({
        records: [
          {
            id: 9001,
            domain: "example.com",
            host: "_xserver-verify",
            type: "TXT",
            content: "xserver-verify=TOK123",
            ttl: 3600,
            priority: 0,
          },
        ],
      }),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "example.com" }, ctx);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      status: "already_verified",
      token: "TOK123",
      record_id: 9001,
      resolved_domain: "example.com",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.path).toBe("/v1/server/sv.example/server-info");
    expect(calls[1]?.path).toBe("/v1/server/sv.example/dns");
    expect(calls[1]?.query).toEqual({ domain: "example.com" });
  });

  it("accepts host in FQDN form (_xserver-verify.{domain})", async () => {
    const { ctx } = makeStubContext([
      ok({ domain_validation_token: "TOK123" }),
      ok({
        records: [
          {
            id: 9002,
            domain: "example.com",
            host: "_xserver-verify.example.com",
            type: "TXT",
            content: "xserver-verify=TOK123",
            ttl: 3600,
            priority: 0,
          },
        ],
      }),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "example.com" }, ctx);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.status).toBe("already_verified");
    expect(body.record_id).toBe(9002);
  });

  it("adds a new TXT record when none matches", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ domain_validation_token: "NEWTOK" }),
      ok({ records: [] }),
      ok({ id: 4076702, message: "DNSレコードを追加しました" }),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "example.com" }, ctx);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.status).toBe("added");
    expect(body.token).toBe("NEWTOK");
    expect(body.record_id).toBe(4076702);
    expect(typeof body.added_at).toBe("string");
    expect(() => new Date(body.added_at).toISOString()).not.toThrow();

    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({
      method: "POST",
      path: "/v1/server/sv.example/dns",
      body: {
        domain: "example.com",
        host: "_xserver-verify",
        type: "TXT",
        content: "xserver-verify=NEWTOK",
        ttl: 3600,
      },
    });
  });

  it("does not treat stale tokens with different value as verified", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ domain_validation_token: "NEWTOK" }),
      ok({
        records: [
          {
            id: 8000,
            domain: "example.com",
            host: "_xserver-verify",
            type: "TXT",
            content: "xserver-verify=OLDTOK",
            ttl: 3600,
            priority: 0,
          },
        ],
      }),
      ok({ id: 9100, message: "added" }),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "example.com" }, ctx);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.status).toBe("added");
    expect(body.record_id).toBe(9100);
    expect(calls).toHaveLength(3);
  });

  it("normalizes IDN domain input to ASCII before calling the API", async () => {
    const idn = "例え.jp";
    const ascii = domainToASCII(idn);
    const { ctx, calls } = makeStubContext([
      ok({ domain_validation_token: "TOK" }),
      ok({ records: [] }),
      ok({ id: 12345, message: "added" }),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: idn }, ctx);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.resolved_domain).toBe(ascii);
    expect(calls[1]?.query).toEqual({ domain: ascii });
    expect(calls[2]?.body).toMatchObject({ domain: ascii });
  });

  it("returns VALIDATION_ERROR for an invalid domain input", async () => {
    const { ctx, calls } = makeStubContext([]);
    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "   " }, ctx);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(calls).toHaveLength(0);
  });

  it("input schema rejects empty domain", () => {
    const tool = ensureDomainVerifiedTool();
    expect(tool.inputSchema.domain.safeParse("").success).toBe(false);
    expect(tool.inputSchema.domain.safeParse("example.com").success).toBe(true);
  });

  it("returns isError when the server-info call fails", async () => {
    const { ctx } = makeStubContext([
      fail(new XserverApiError("unauthorized", 401, { message: "unauthorized" })),
    ]);

    const tool = ensureDomainVerifiedTool();
    const result = await tool.handler({ domain: "example.com" }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("unauthorized");
  });
});
