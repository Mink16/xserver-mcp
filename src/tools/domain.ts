import { domainToASCII } from "node:url";

export class DomainValidationError extends Error {
  override readonly name = "DomainValidationError";
  readonly input: string;

  constructor(message: string, input: string) {
    super(message);
    this.input = input;
  }
}

export function toPunycodeDomain(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new DomainValidationError("Domain must not be empty", input);
  }
  const ascii = domainToASCII(trimmed).toLowerCase();
  if (!ascii) {
    throw new DomainValidationError(`Invalid domain: ${JSON.stringify(input)}`, input);
  }
  return ascii;
}

export interface NormalizedMailAddress {
  mail_address: string;
  local: string;
  domain: string;
}

export function normalizeMailAddress(mailAddress: string): NormalizedMailAddress {
  const atIdx = mailAddress.lastIndexOf("@");
  if (atIdx < 1 || atIdx === mailAddress.length - 1) {
    throw new DomainValidationError(
      `mail_address must be in the form local@domain: ${JSON.stringify(mailAddress)}`,
      mailAddress,
    );
  }
  const local = mailAddress.slice(0, atIdx);
  const rawDomain = mailAddress.slice(atIdx + 1);
  const domain = toPunycodeDomain(rawDomain);
  return { mail_address: `${local}@${domain}`, local, domain };
}
