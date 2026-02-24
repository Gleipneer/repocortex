import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Resolve storage root (repocortex/storage or REPOCORTEX_STORAGE).
 */
export function getStorageRoot(override?: string): string {
  if (override) return override;
  const env = process.env["REPOCORTEX_STORAGE"];
  if (env) return env;
  return join(process.cwd(), "storage");
}

/**
 * Paths under storage/ per CONTRACTS.
 */
export function getStoragePaths(root: string, snapshotId: string) {
  return {
    fileIndex: join(root, "snapshots", snapshotId, "fileIndex.json"),
    depGraph: join(root, "facts", "depGraph.json"),
    symbolIndex: join(root, "facts", "symbolIndex.json"),
    runtimeSignals: join(root, "facts", "runtimeSignals.json"),
    brainTopology: join(root, "topology", "brain_topology.json"),
    flows: join(root, "topology", "flows.json"),
    gapsReportJson: join(root, "analysis", "gaps_report.json"),
    gapsReportMd: join(root, "analysis", "gaps_report.md"),
    essencePackJson: join(root, "essence", "pack.json"),
    essencePackMd: join(root, "essence", "pack.md"),
    ledger: join(root, "ledger", "ledger.jsonl")
  };
}

/**
 * List snapshot IDs in outputDir/snapshots (sorted). Used by gaps/essence to discover map output.
 */
export async function getSnapshotIds(outputDir: string): Promise<string[]> {
  const snapDir = join(outputDir, "snapshots");
  try {
    const names = await readdir(snapDir);
    return names.filter((n) => n !== "." && n !== "..").sort();
  } catch {
    return [];
  }
}
