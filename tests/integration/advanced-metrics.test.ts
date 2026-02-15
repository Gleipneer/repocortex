import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseAdvancedMetrics } from "../../src/core/validate.js";
import { stableStringify } from "../../src/core/stableJson.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist/cli/main.js");
const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/advanced-metrics");

describe("advanced metrics", () => {
  it("repocortex metrics generates advanced_metrics.json and ledger entry", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const firstLedger = await fs.readFile(path.join(outDir, "ledger", "ledger.jsonl"), "utf8");
    const firstLines = firstLedger.trim().split("\n");
    const pipelineEntry = JSON.parse(firstLines[firstLines.length - 1]!);
    const outputHashAfterPipeline = pipelineEntry.outputHash;

    await execFileAsync("node", [cli, "metrics", "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    const advancedPath = path.join(outDir, "advanced", "advanced_metrics.json");
    await fs.access(advancedPath);
    const raw = JSON.parse(await fs.readFile(advancedPath, "utf8")) as unknown;
    const metrics = parseAdvancedMetrics(raw);
    expect(metrics.schemaVersion).toBe("1.0");
    expect(metrics.stabilityIndex).toBeGreaterThanOrEqual(0);
    expect(metrics.stabilityIndex).toBeLessThanOrEqual(1);
    const pagerankSum = Object.values(metrics.pageRank).reduce((s, v) => s + v, 0);
    expect(pagerankSum).toBeCloseTo(1.0, 8);

    const ledgerContent = await fs.readFile(path.join(outDir, "ledger", "ledger.jsonl"), "utf8");
    const lines = ledgerContent.trim().split("\n");
    const lastEntry = JSON.parse(lines[lines.length - 1]!);
    expect(lastEntry.command).toBe("metrics");
    expect(lastEntry.advancedMetricsHash).toBeDefined();
    expect(lastEntry.artifacts).toContain("advanced/advanced_metrics.json");

    expect(pipelineEntry.outputHash).toBe(outputHashAfterPipeline);
  });

  it("advanced_metrics.json is deterministic across two metrics runs", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });

    await execFileAsync("node", [cli, "metrics", "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });
    const content1 = await fs.readFile(
      path.join(outDir, "advanced", "advanced_metrics.json"),
      "utf8"
    );
    const parsed1 = JSON.parse(content1) as unknown;

    await execFileAsync("node", [cli, "metrics", "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });
    const content2 = await fs.readFile(
      path.join(outDir, "advanced", "advanced_metrics.json"),
      "utf8"
    );
    const parsed2 = JSON.parse(content2) as unknown;

    expect(stableStringify(parsed1)).toBe(stableStringify(parsed2));
  });
});
