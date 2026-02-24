import fs from "node:fs/promises";
import path from "node:path";
import { computeOutputHash } from "../core/artifactHash.js";
import { readJson } from "../core/io.js";
import { ensureDir, writeJsonAtomic } from "../core/io.js";
import { validateOrThrow } from "../core/io.js";
import {
  parseFileIndex,
  parseDepGraph,
  parseSymbolIndex,
  parseRuntimeSignals,
  parseBrainTopology,
  parseFlows,
  parseGapsReport,
  parseEssencePack,
  parseAdvancedMetrics,
  parseArtifactManifest
} from "../core/validate.js";
import { parseLedgerEntry } from "../core/validate.js";
import { LastVerificationSchema } from "../schemas/verification.schema.js";

const LEDGER_PATH = "ledger/ledger.jsonl";
const VERIFICATION_DIR = "verification";
const LAST_VERIFICATION_FILE = "verification/last_verification.json";

function unwrapEssenceIfWrapped(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!("identity" in obj) || !("payload" in obj)) return raw;
  return obj.payload;
}

/**
 * Map artifact path (relative) to a validator. Only JSON artifacts; .md skipped.
 */
function getValidator(relPath: string): ((data: unknown) => unknown) | null {
  if (relPath.endsWith(".md")) return null;
  if (relPath.endsWith("fileIndex.json")) return parseFileIndex;
  if (relPath === "facts/depGraph.json") return parseDepGraph;
  if (relPath === "facts/symbolIndex.json") return parseSymbolIndex;
  if (relPath === "facts/runtimeSignals.json") return parseRuntimeSignals;
  if (relPath === "topology/brain_topology.json") return parseBrainTopology;
  if (relPath === "topology/flows.json") return parseFlows;
  if (relPath === "analysis/gaps_report.json") return parseGapsReport;
  if (relPath === "essence/pack.json") return parseEssencePack;
  if (relPath === "advanced/advanced_metrics.json") return parseAdvancedMetrics;
  if (relPath === "system/manifest.json") return parseArtifactManifest;
  return null;
}

/**
 * Load latest ledger entry from outputDir.
 */
export async function loadLatestLedgerEntry(outputDir: string): Promise<{
  runId: string;
  outputHash: string;
  artifacts: string[];
}> {
  const ledgerPath = path.join(outputDir, LEDGER_PATH);
  const content = await fs.readFile(ledgerPath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const lastLine = lines[lines.length - 1];
  if (!lastLine) throw new Error("Ledger is empty.");
  const entry = parseLedgerEntry(JSON.parse(lastLine) as unknown);
  return {
    runId: entry.runId,
    outputHash: entry.outputHash,
    artifacts: entry.artifacts
  };
}

/**
 * Recompute output hash from artifact files (same algorithm as pipeline).
 */
export async function recomputeArtifactHash(
  outputDir: string,
  artifactPaths: string[]
): Promise<string> {
  return computeOutputHash(outputDir, artifactPaths);
}

/**
 * Validate all JSON artifacts with their schemas. Returns true if all valid.
 */
export async function validateArtifactSchemas(
  outputDir: string,
  artifactPaths: string[]
): Promise<boolean> {
  const outAbs = path.resolve(outputDir);
  for (const rel of artifactPaths) {
    const validator = getValidator(rel);
    if (!validator) continue;
    const full = path.join(outAbs, rel);
    let raw: unknown;
    try {
      raw = await readJson(full);
    } catch {
      return false;
    }
    try {
      const data = rel === "essence/pack.json" ? unwrapEssenceIfWrapped(raw) : raw;
      validator(data);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Run verification: load latest ledger, recompute hash, validate schemas, write last_verification.json.
 */
export async function runVerify(
  outputDir: string,
  verifiedAtIso: string
): Promise<{
  hashMatch: boolean;
  schemaValid: boolean;
}> {
  const outAbs = path.resolve(outputDir);
  const { outputHash: expectedHash, artifacts } = await loadLatestLedgerEntry(outputDir);

  const computedHash = await recomputeArtifactHash(outputDir, artifacts);
  const hashMatch = computedHash === expectedHash;
  const schemaValid = await validateArtifactSchemas(outputDir, artifacts);

  const verification = validateOrThrow(LastVerificationSchema, {
    schemaVersion: "1.0",
    verifiedAtIso,
    hashMatch,
    schemaValid
  });

  await ensureDir(path.join(outAbs, VERIFICATION_DIR));
  const outPath = path.join(outAbs, LAST_VERIFICATION_FILE);
  await writeJsonAtomic(outPath, verification, outputDir);

  return { hashMatch, schemaValid };
}
