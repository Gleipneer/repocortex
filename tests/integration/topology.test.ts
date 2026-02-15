import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { detectRuntimeSignals } from "../../src/analysis/runtimeSignals.js";
import { buildDepGraph } from "../../src/graph/depGraph.js";
import { buildTopology } from "../../src/topology/buildTopology.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-topology");

describe("buildTopology", () => {
  it("flags net/write nodes", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const { fileIndex } = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });
    const runtimeSignals = await detectRuntimeSignals({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });
    const { depGraph, symbolIndex } = await buildDepGraph({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });

    const { topology } = await buildTopology({
      outputDir: outDir,
      depGraph,
      runtimeSignals,
      _symbolIndex: symbolIndex
    });

    const runtimeNode = topology.nodes.find((n) => n.id.endsWith("src/runtime.ts"));
    expect(runtimeNode).toBeTruthy();
    expect(runtimeNode!.riskFlags).toContain("net-exposure");
    expect(runtimeNode!.riskFlags).toContain("writes");
  });
});
