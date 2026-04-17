import { domainToASCII } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorFromResponse, type XserverApiError } from "../../../src/client/errors.js";
import { createMailAccountWithVerificationTool } from "../../../src/tools/domainVerification/createMailAccountWithVerification.js";
import { fail, makeStubContext, ok } from "../../helpers/stubClient.js";

function apiError(status: number, body: unknown): XserverApiError {
  return errorFromResponse(status, body, new Headers());
}

function verifyError(): XserverApiError {
  return apiError(409, {
    error: {
      code: "OPERATION_ERROR",
      message: "TXTレコードによるドメイン認証に失敗しました。",
    },
  });
}

describe("create_mail_account_with_verification", () => {
  it("creates mail account when domain is already verified", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ accounts: [] }), // GET /mail?domain=
      ok({ domain_validation_token: "TOK" }), // GET /server-info
      ok({
        records: [
          {
            id: 1,
            domain: "example.com",
            host: "_xserver-verify",
            type: "TXT",
            content: "xserver-verify=TOK",
            ttl: 3600,
            priority: 0,
          },
        ],
      }), // GET /dns
      ok({ message: "メールアカウントを作成しました" }), // POST /mail
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler(
      {
        mail_address: "user@example.com",
        password: "Secret1234",
        quota_mb: 2000,
      },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.mail_address).toBe("user@example.com");
    expect(body.resolved_mail_address).toBe("user@example.com");
    expect(body.resolved_domain).toBe("example.com");
    expect(body.verification.status).toBe("already_verified");
    expect(body.verification.resolved_domain).toBe("example.com");
    expect(body.mail.message).toContain("作成");

    expect(calls).toHaveLength(4);
    expect(calls[3]).toEqual({
      method: "POST",
      path: "/v1/server/sv.example/mail",
      body: {
        mail_address: "user@example.com",
        password: "Secret1234",
        quota_mb: 2000,
      },
    });
  });

  it("returns ALREADY_EXISTS when the mail address already exists", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ accounts: [{ mail_address: "user@example.com", quota_mb: 2000 }] }),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler(
      { mail_address: "user@example.com", password: "Secret1234" },
      ctx,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("ALREADY_EXISTS");
    expect(calls).toHaveLength(1);
  });

  it("adds TXT record then creates mail account when not verified", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ accounts: [] }),
      ok({ domain_validation_token: "NEWTOK" }),
      ok({ records: [] }),
      ok({ id: 4076702, message: "added" }),
      ok({ message: "created" }),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler(
      { mail_address: "user@example.com", password: "Secret1234" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.verification.status).toBe("added");
    expect(body.verification.record_id).toBe(4076702);
    expect(calls).toHaveLength(5);
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries on 409 domain verification error until success", async () => {
      const { ctx, calls } = makeStubContext([
        ok({ accounts: [] }),
        ok({ domain_validation_token: "TOK" }),
        ok({ records: [] }),
        ok({ id: 4076702, message: "added" }),
        fail(verifyError()),
        fail(verifyError()),
        ok({ message: "created" }),
      ]);

      const tool = createMailAccountWithVerificationTool();
      const promise = tool.handler(
        {
          mail_address: "user@example.com",
          password: "Secret1234",
          verification_wait_ms: 90_000,
          poll_interval_ms: 30_000,
        },
        ctx,
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);

      const result = await promise;
      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0]?.text ?? "");
      expect(body.mail.message).toBe("created");
      // 4 setup calls + 3 mail POST attempts
      expect(calls).toHaveLength(7);
    });

    it("returns DOMAIN_VERIFICATION_TIMEOUT when all attempts fail", async () => {
      const { ctx, calls } = makeStubContext([
        ok({ accounts: [] }),
        ok({ domain_validation_token: "TOK" }),
        ok({ records: [] }),
        ok({ id: 4076702, message: "added" }),
        fail(verifyError()),
        fail(verifyError()),
        fail(verifyError()),
      ]);

      const tool = createMailAccountWithVerificationTool();
      const promise = tool.handler(
        {
          mail_address: "user@example.com",
          password: "Secret1234",
          verification_wait_ms: 90_000,
          poll_interval_ms: 30_000,
        },
        ctx,
      );

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);

      const result = await promise;
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content[0]?.text ?? "");
      expect(body.code).toBe("DOMAIN_VERIFICATION_TIMEOUT");
      expect(body.detail.attempts).toBe(3);
      expect(body.detail.record_id).toBe(4076702);
      expect(body.detail.token).toBe("TOK");
      expect(calls).toHaveLength(7);
    });
  });

  it("does not retry on non-verification errors", async () => {
    const { ctx, calls } = makeStubContext([
      ok({ accounts: [] }),
      ok({ domain_validation_token: "TOK" }),
      ok({
        records: [
          {
            id: 1,
            domain: "example.com",
            host: "_xserver-verify",
            type: "TXT",
            content: "xserver-verify=TOK",
            ttl: 3600,
            priority: 0,
          },
        ],
      }),
      fail(apiError(500, { error: { code: "INTERNAL_ERROR", message: "internal error" } })),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler(
      { mail_address: "user@example.com", password: "Secret1234" },
      ctx,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).not.toBe("DOMAIN_VERIFICATION_TIMEOUT");
    expect(calls).toHaveLength(4);
  });

  it("normalizes 422 to VALIDATION_ERROR", async () => {
    const { ctx } = makeStubContext([
      fail(apiError(422, { error: { code: "VALIDATION_ERROR", message: "invalid input" } })),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler(
      { mail_address: "user@example.com", password: "Secret1234" },
      ctx,
    );

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.detail.status).toBe(422);
  });

  it("converts idn domain to punycode before calling APIs", async () => {
    const idn = "例え.jp";
    const ascii = domainToASCII(idn);
    expect(ascii).not.toBe("");
    expect(ascii.startsWith("xn--")).toBe(true);

    const { ctx, calls } = makeStubContext([
      ok({ accounts: [] }),
      ok({ domain_validation_token: "T" }),
      ok({
        records: [
          {
            id: 1,
            domain: ascii,
            host: "_xserver-verify",
            type: "TXT",
            content: "xserver-verify=T",
            ttl: 3600,
            priority: 0,
          },
        ],
      }),
      ok({ message: "created" }),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler({ mail_address: `user@${idn}`, password: "Secret1234" }, ctx);

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.mail_address).toBe(`user@${idn}`);
    expect(body.resolved_mail_address).toBe(`user@${ascii}`);
    expect(body.resolved_domain).toBe(ascii);
    expect(calls[0]?.query).toEqual({ domain: ascii });
    expect(calls[2]?.query).toEqual({ domain: ascii });
    expect(calls[3]?.body).toMatchObject({ mail_address: `user@${ascii}` });
  });

  it("detects an existing IDN account via normalized comparison", async () => {
    const idn = "例え.jp";
    const ascii = domainToASCII(idn);
    const { ctx, calls } = makeStubContext([
      ok({ accounts: [{ mail_address: `user@${ascii}`, quota_mb: 2000 }] }),
    ]);

    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler({ mail_address: `user@${idn}`, password: "Secret1234" }, ctx);

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("ALREADY_EXISTS");
    expect(body.detail.resolved_mail_address).toBe(`user@${ascii}`);
    expect(calls).toHaveLength(1);
  });

  it("returns VALIDATION_ERROR when mail_address lacks '@'", async () => {
    const { ctx, calls } = makeStubContext([]);
    const tool = createMailAccountWithVerificationTool();
    const result = await tool.handler({ mail_address: "no-at-sign", password: "Secret1234" }, ctx);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]?.text ?? "");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(calls).toHaveLength(0);
  });

  it("input schema rejects short password", () => {
    const tool = createMailAccountWithVerificationTool();
    expect(tool.inputSchema.password.safeParse("12345").success).toBe(false);
    expect(tool.inputSchema.password.safeParse("abcdef").success).toBe(true);
  });
});
