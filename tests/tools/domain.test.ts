import { describe, expect, it } from "vitest";
import {
  DomainValidationError,
  normalizeMailAddress,
  toPunycodeDomain,
} from "../../src/tools/domain.js";

describe("toPunycodeDomain", () => {
  it("converts Japanese IDN to xn-- form", () => {
    const ascii = toPunycodeDomain("例え.jp");
    expect(ascii.startsWith("xn--")).toBe(true);
    expect(ascii.endsWith(".jp")).toBe(true);
  });

  it("passes ASCII domains through unchanged", () => {
    expect(toPunycodeDomain("example.com")).toBe("example.com");
  });

  it("lowercases mixed-case ASCII domains", () => {
    expect(toPunycodeDomain("Example.COM")).toBe("example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(toPunycodeDomain("  example.com  ")).toBe("example.com");
  });

  it("leaves already-punycoded input unchanged", () => {
    const punycoded = toPunycodeDomain("例え.jp");
    expect(toPunycodeDomain(punycoded)).toBe(punycoded);
  });

  it("throws DomainValidationError for empty input", () => {
    expect(() => toPunycodeDomain("")).toThrow(DomainValidationError);
    expect(() => toPunycodeDomain("   ")).toThrow(DomainValidationError);
  });

  it("throws DomainValidationError for structurally invalid input", () => {
    expect(() => toPunycodeDomain("exa mple.com")).toThrow(DomainValidationError);
  });

  it("attaches the raw input to the thrown error", () => {
    try {
      toPunycodeDomain("");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DomainValidationError);
      expect((err as DomainValidationError).input).toBe("");
    }
  });
});

describe("normalizeMailAddress", () => {
  it("normalizes domain part while keeping local intact", () => {
    const result = normalizeMailAddress("user@例え.jp");
    expect(result.local).toBe("user");
    expect(result.domain.startsWith("xn--")).toBe(true);
    expect(result.mail_address).toBe(`user@${result.domain}`);
  });

  it("keeps ASCII mail addresses unchanged other than domain lowercase", () => {
    expect(normalizeMailAddress("info@Example.COM").mail_address).toBe("info@example.com");
  });

  it("uses the last '@' as separator (allows '@' in local part edge-case)", () => {
    const result = normalizeMailAddress("odd@name@example.com");
    expect(result.local).toBe("odd@name");
    expect(result.domain).toBe("example.com");
  });

  it("throws when '@' is missing", () => {
    expect(() => normalizeMailAddress("no-at-sign")).toThrow(DomainValidationError);
  });

  it("throws when local part is empty", () => {
    expect(() => normalizeMailAddress("@example.com")).toThrow(DomainValidationError);
  });

  it("throws when domain part is empty", () => {
    expect(() => normalizeMailAddress("user@")).toThrow(DomainValidationError);
  });

  it("throws DomainValidationError when domain part is invalid", () => {
    expect(() => normalizeMailAddress("user@ ")).toThrow(DomainValidationError);
  });
});
