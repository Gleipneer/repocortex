import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { buildDepGraph } from "../../src/graph/depGraph.js";
import { detectRuntimeSignals } from "../../src/analysis/runtimeSignals.js";
import { buildTopology } from "../../src/topology/buildTopology.js";
import { detectGaps } from "../../src/analysis/gaps.js";
import { buildEssencePack } from "../../src/analysis/essence.js";
import { getStoragePaths } from "../../src/utils/paths.js";
import { readJson } from "../../src/core/io.js";
import { parseBrainTopology, parseGapsReport } from "../../src/core/validate.js";
import { stableStringify } from "../../src/core/stableJson.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir1 = path.resolve("tests/.tmp/out-pipeline-det-1");
const outDir2 = path.resolve("tests/.tmp/out-pipeline-det-2");
const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

async function runFullPipeline(outputDir: string): Promise<{ snapshotId: string }> {
  const { snapshotId, fileIndex } = await scanRepo({
    repoRoot: fixtureRepo,
    outputDir,
    clock
  });

  const { depGraph, symbolIndex } = await buildDepGraph({
    repoRoot: fixtureRepo,
    outputDir,
    fileIndex
  });
  const runtimeSignals = await detectRuntimeSignals({
    repoRoot: fixtureRepo,
    outputDir,
    fileIndex
  });
  await buildTopology({
    outputDir,
    depGraph,
    runtimeSignals,
    _symbolIndex: symbolIndex
  });

  await detectGaps({
    outputDir,
    fileIndex,
    depGraph,
    runtimeSignals
  });

  const paths = getStoragePaths(outputDir, snapshotId);
  const topology = parseBrainTopology(await readJson(paths.brainTopology));
  const gapsReport = parseGapsReport(await readJson(paths.gapsReportJson));
  await buildEssencePack({ outputDir, topology, gapsReport });

  return { snapshotId };
}

describe("pipeline determinism", () => {
  it("two full runs produce identical artifacts (excluding ledger timestamps)", async () => {
    await fs.rm(outDir1, { recursive: true, force: true });
    await fs.rm(outDir2, { recursive: true, force: true });

    const { snapshotId: id1 } = await runFullPipeline(outDir1);
    const { snapshotId: id2 } = await runFullPipeline(outDir2);

    expect(id1).toBe(id2);
    const snapshotId = id1;

    const paths1 = getStoragePaths(outDir1, snapshotId);
    const paths2 = getStoragePaths(outDir2, snapshotId);

    const jsonPairs: [string, string][] = [
      [paths1.fileIndex, paths2.fileIndex],
      [paths1.depGraph, paths2.depGraph],
      [paths1.symbolIndex, paths2.symbolIndex],
      [paths1.runtimeSignals, paths2.runtimeSignals],
      [paths1.brainTopology, paths2.brainTopology],
      [paths1.flows, paths2.flows],
      [paths1.gapsReportJson, paths2.gapsReportJson],
      [paths1.essencePackJson, paths2.essencePackJson]
    ];

    for (const [p1, p2] of jsonPairs) {
      const a = await readJson(p1);
      const b = await readJson(p2);
      expect(stableStringify(a)).toBe(stableStringify(b));
    }
  });
});
