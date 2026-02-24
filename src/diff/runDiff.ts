import path from "node:path";
import { readJson } from "../core/io.js";
import { parseFileIndex } from "../core/validate.js";
import { ensureDir, validateOrThrow, writeJsonAtomic } from "../core/io.js";
import { DiffReportSchema } from "../schemas/diffReport.schema.js";

/**
 * Compare two snapshot file indexes. Deterministic.
 * addedNodes = paths in id2 not in id1, removedNodes = paths in id1 not in id2.
 * edgeDelta/riskDelta = 0 (no per-snapshot edge/risk data).
 */
export async function runDiff(
  outputDir: string,
  snapshotId1: string,
  snapshotId2: string
): Promise<string> {
  const dir1 = path.join(outputDir, "snapshots", snapshotId1, "fileIndex.json");
  const dir2 = path.join(outputDir, "snapshots", snapshotId2, "fileIndex.json");

  const raw1 = await readJson(dir1);
  const raw2 = await readJson(dir2);
  const idx1 = parseFileIndex(raw1);
  const idx2 = parseFileIndex(raw2);

  const paths1 = new Set(idx1.files.map((f) => f.path).sort());
  const paths2 = new Set(idx2.files.map((f) => f.path).sort());

  const addedNodes = [...paths2].filter((p) => !paths1.has(p)).sort();
  const removedNodes = [...paths1].filter((p) => !paths2.has(p)).sort();

  const report = validateOrThrow(DiffReportSchema, {
    schemaVersion: "1.0",
    snapshotId1,
    snapshotId2,
    addedNodes,
    removedNodes,
    edgeDelta: 0,
    riskDelta: 0
  });

  const diffDir = path.join(outputDir, "diff");
  await ensureDir(diffDir);
  const safe1 = snapshotId1.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safe2 = snapshotId2.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outPath = path.join(diffDir, `diff_${safe1}_${safe2}.json`);
  await writeJsonAtomic(outPath, report, outputDir);
  return outPath;
}
