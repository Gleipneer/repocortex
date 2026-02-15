import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { buildDepGraph } from "../../src/graph/depGraph.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-depGraph");

describe("buildDepGraph", () => {
  it("extracts local dependencies and symbols", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const { fileIndex } = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });
    const { depGraph, symbolIndex } = await buildDepGraph({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });

    expect(depGraph.nodes.length).toBeGreaterThan(0);
    expect(depGraph.edges.some((e) => e.to.includes("./util"))).toBe(true);
    expect(symbolIndex.symbols.some((s) => s.name === "answer")).toBe(true);
  });
});
