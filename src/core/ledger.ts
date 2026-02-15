import fs from "node:fs/promises";
import path from "node:path";
import { stableStringify } from "./stableJson.js";
import { sha256 } from "./hash.js";
import { ensureDir, validateOrThrow } from "./io.js";
import { LedgerEntrySchema, type LedgerEntry } from "../schemas/ledger.schema.js";

/**
 * Compute outputHash from produced JSON artifacts: read each path, parse JSON,
 * stableStringify, concatenate in order, then sha256. Paths can be absolute or relative to outputDir.
 */
export async function computeOutputHash(
  artifactPaths: string[],
  outputDir: string
): Promise<string> {
  const outAbs = path.resolve(outputDir);
  const parts: string[] = [];
  for (const p of artifactPaths) {
    const full = path.isAbsolute(p) ? p : path.join(outAbs, p);
    const raw = await fs.readFile(full, "utf8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      parts.push(stableStringify(parsed));
    } catch {
      parts.push(raw);
    }
  }
  return sha256(parts.join(""));
}

export async function appendLedger(params: {
  outputDir: string;
  entry: Omit<LedgerEntry, "schemaVersion"> & { schemaVersion?: "1.0" };
}) {
  const outputDir = path.resolve(params.outputDir);
  const file = path.join(outputDir, "ledger", "ledger.jsonl");
  await ensureDir(path.dirname(file));

  const entry = validateOrThrow(LedgerEntrySchema, {
    schemaVersion: "1.0",
    ...params.entry
  });

  const line = stableStringify(entry) + "\n";
  await fs.appendFile(file, line, "utf8");
}
