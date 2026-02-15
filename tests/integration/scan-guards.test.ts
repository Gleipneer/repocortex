import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scanRepo } from "../../src/scanner/scan.js";

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/out-scan-guards");

describe("scan guards", () => {
  it("guards do not trigger on mini-repo (default limits)", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const res = await scanRepo({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      clock
    });

    expect(res.snapshotId).toBeDefined();
    expect(res.fileIndex.totals.fileCount).toBeLessThan(50_000);
    expect(res.fileIndex.totals.totalBytes).toBeLessThan(2 * 1024 * 1024 * 1024);
  });

  it("guards do not trigger when --max-files/--max-bytes above actual (explicit limits)", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const res = await scanRepo({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      clock,
      maxFiles: 100,
      maxBytes: 10 * 1024 * 1024
    });

    expect(res.snapshotId).toBeDefined();
  });

  it("throws when over limit and force is false", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    await expect(
      scanRepo({
        repoRoot: fixtureRepo,
        outputDir: outDir,
        clock,
        maxFiles: 1,
        maxBytes: 1
      })
    ).rejects.toThrow(/exceeds safety limits/);
  });

  it("succeeds when over limit and force is true", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    const clock = { nowIso: () => "2000-01-01T00:00:00.000Z" };

    const res = await scanRepo({
      repoRoot: fixtureRepo,
      outputDir: outDir,
      clock,
      maxFiles: 1,
      maxBytes: 1,
      force: true
    });

    expect(res.snapshotId).toBeDefined();
  });
});
