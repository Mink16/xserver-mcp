import { createMailAccountWithVerificationTool } from "./createMailAccountWithVerification.js";
import { ensureDomainVerifiedTool } from "./ensureDomainVerified.js";
import type { AnyToolDefinition } from "../types.js";

export function domainVerificationTools(): AnyToolDefinition[] {
  return [ensureDomainVerifiedTool(), createMailAccountWithVerificationTool()];
}
