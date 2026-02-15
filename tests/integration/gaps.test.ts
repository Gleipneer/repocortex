import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { detectRuntimeSignals } from "../../src/analysis/runtimeSignals.js";
import { buildDepGraph } from "../../src/graph/depGraph.js";
import { detectGaps } from "../../src/analysis/gaps.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-gaps");

describe("detectGaps", () => {
  it("reports fsWrite and risk present (deterministic order)", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const { fileIndex } = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });
    const runtimeSignals = await detectRuntimeSignals({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });
    const { depGraph } = await buildDepGraph({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });

    const report = await detectGaps({
      outputDir: outDir,
      fileIndex,
      depGraph,
      runtimeSignals
    });

    expect(report.gaps.length).toBeGreaterThan(0);
    const hasWrites = report.gaps.some(
      (g) => g.title.includes("Writes") || g.title.includes("write")
    );
    expect(hasWrites).toBe(true);
    const hasRuntimeEvidence = report.gaps.some((g) =>
      g.evidence.some((e) => e.file.includes("runtime"))
    );
    expect(hasRuntimeEvidence).toBe(true);

    for (let i = 1; i < report.gaps.length; i++) {
      const a = report.gaps[i - 1]!;
      const b = report.gaps[i]!;
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const cmp = sevOrder[a.severity] - sevOrder[b.severity];
      if (cmp !== 0) expect(sevOrder[a.severity]).toBeLessThanOrEqual(sevOrder[b.severity]);
      else expect(a.title <= b.title).toBe(true);
    }
  });
});
