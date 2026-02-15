import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";
import { stableStringify } from "../../src/core/stableJson.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-scan");

describe("scanRepo", () => {
  it("produces deterministic fileIndex (excluding generatedAtIso)", async () => {
    await fs.rm(outDir, { recursive: true, force: true });

    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const r1 = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });
    const r2 = await scanRepo({ repoRoot: fixtureRepo, outputDir: outDir, clock });

    // Same inputHash and snapshotId
    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.snapshotId).toBe(r2.snapshotId);

    // Same fileIndex content
    expect(stableStringify(r1.fileIndex)).toBe(stableStringify(r2.fileIndex));
  });
});
