import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LedgerEntry } from "../schemas/ledger.schema.js";
import { stableStringify } from "../core/stableJson.js";

/**
 * Append one ledger entry (one JSON line). Creates ledger dir if needed.
 * Uses stableStringify so output is deterministic.
 */
export async function appendLedgerEntry(ledgerPath: string, entry: LedgerEntry): Promise<void> {
  await mkdir(dirname(ledgerPath), { recursive: true });
  const line = stableStringify(entry) + "\n";
  await appendFile(ledgerPath, line, "utf8");
}
