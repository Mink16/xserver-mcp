import { createDnsRecordTool } from "./createDnsRecord.js";
import { deleteDnsRecordTool } from "./deleteDnsRecord.js";
import { listDnsRecordsTool } from "./listDnsRecords.js";
import { updateDnsRecordTool } from "./updateDnsRecord.js";
import type { AnyToolDefinition } from "../types.js";

export function dnsTools(): AnyToolDefinition[] {
  return [
    listDnsRecordsTool(),
    createDnsRecordTool(),
    updateDnsRecordTool(),
    deleteDnsRecordTool(),
  ];
}
