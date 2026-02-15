import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { detectRuntimeSignals } from "../../src/analysis/runtimeSignals.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-runtimeSignals");

describe("detectRuntimeSignals", () => {
  it("detects signals deterministically", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const { fileIndex } = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });
    const signals = await detectRuntimeSignals({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      fileIndex
    });

    const kinds = signals.signals.map((s) => s.kind);
    expect(kinds).toContain("httpServer");
    expect(kinds).toContain("setInterval");
    expect(kinds).toContain("fsWrite");
  });
});
