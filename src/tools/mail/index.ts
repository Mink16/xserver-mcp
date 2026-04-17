import { createMailAccountTool } from "./createMailAccount.js";
import { deleteMailAccountTool } from "./deleteMailAccount.js";
import { getMailAccountTool } from "./getMailAccount.js";
import { getMailForwardingTool } from "./getMailForwarding.js";
import { listMailAccountsTool } from "./listMailAccounts.js";
import { updateMailAccountTool } from "./updateMailAccount.js";
import { updateMailForwardingTool } from "./updateMailForwarding.js";
import type { AnyToolDefinition } from "../types.js";

export function mailTools(): AnyToolDefinition[] {
  return [
    listMailAccountsTool(),
    createMailAccountTool(),
    getMailAccountTool(),
    updateMailAccountTool(),
    deleteMailAccountTool(),
    getMailForwardingTool(),
    updateMailForwardingTool(),
  ];
}
