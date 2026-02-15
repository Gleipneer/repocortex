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
import { SUPPORTED_SCHEMA_VERSION, assertSupportedVersion } from "../../src/schemas/version.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-pipeline-e2e");

describe("pipeline e2e", () => {
  it("scan -> map -> gaps -> essence produces all artifacts with schemaVersion 1.0", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const { snapshotId, fileIndex } = await scanRepo({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      clock
    });

    const { depGraph, symbolIndex } = await buildDepGraph({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });
    const runtimeSignals = await detectRuntimeSignals({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });
    await buildTopology({
      outputDir: outDir,
      depGraph,
      runtimeSignals,
      _symbolIndex: symbolIndex
    });

    await detectGaps({
      outputDir: outDir,
      fileIndex,
      depGraph,
      runtimeSignals
    });

    const paths = getStoragePaths(outDir, snapshotId);
    const topology = parseBrainTopology(await readJson(paths.brainTopology));
    const gapsReport = parseGapsReport(await readJson(paths.gapsReportJson));
    await buildEssencePack({ outputDir: outDir, topology, gapsReport });

    const jsonArtifacts: { name: string; path: string }[] = [
      { name: "fileIndex", path: paths.fileIndex },
      { name: "depGraph", path: paths.depGraph },
      { name: "symbolIndex", path: paths.symbolIndex },
      { name: "runtimeSignals", path: paths.runtimeSignals },
      { name: "brain_topology", path: paths.brainTopology },
      { name: "flows", path: paths.flows },
      { name: "gaps_report", path: paths.gapsReportJson },
      { name: "essence pack", path: paths.essencePackJson }
    ];

    for (const { name, path: p } of jsonArtifacts) {
      const content = await readJson(p);
      const obj = content as Record<string, unknown>;
      expect(obj.schemaVersion, `${name} must have schemaVersion`).toBeDefined();
      assertSupportedVersion(obj.schemaVersion, name);
      expect(obj.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
    }

    const mdPaths = [paths.gapsReportMd, paths.essencePackMd];
    for (const p of mdPaths) {
      await expect(fs.access(p)).resolves.toBeUndefined();
    }
  });
});
