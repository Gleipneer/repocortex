import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist/cli/main.js");
const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/structural-maturity");

async function runPipeline(clock: string) {
  await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
    cwd: path.resolve("."),
    env: { ...process.env, REPOCORTEX_CLOCK_ISO: clock }
  });
}

describe("structural maturity", () => {
  it("snapshot-contracts writes contracts_snapshot.json with expected schema", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");

    const { stdout } = await execFileAsync("node", [cli, "snapshot-contracts", "--out", outDir], {
      cwd: path.resolve(".")
    });
    expect(stdout).toBeDefined();

    const p = path.join(outDir, "contracts", "contracts_snapshot.json");
    const raw = await fs.readFile(p, "utf8");
    const data = JSON.parse(raw);
    expect(data.schemaVersion).toBe("1.0");
    expect(typeof data.repocortexVersion).toBe("string");
    expect(typeof data.nodeVersion).toBe("string");
    expect(typeof data.timestamp).toBe("string");
    expect(typeof data.schemaHashes).toBe("object");
    expect(typeof data.cliSourceHash).toBe("string");
  });

  it("export produces deterministic graphml/mermaid/dot (two runs byte-identical)", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");

    await execFileAsync("node", [cli, "export", "--format", "graphml", "--out", outDir], {
      cwd: path.resolve(".")
    });
    const graphml1 = await fs.readFile(path.join(outDir, "exports", "topology.graphml"), "utf8");

    await execFileAsync("node", [cli, "export", "--format", "graphml", "--out", outDir], {
      cwd: path.resolve(".")
    });
    const graphml2 = await fs.readFile(path.join(outDir, "exports", "topology.graphml"), "utf8");
    expect(graphml1).toBe(graphml2);

    await execFileAsync("node", [cli, "export", "--format", "mermaid", "--out", outDir], {
      cwd: path.resolve(".")
    });
    const mmd = await fs.readFile(path.join(outDir, "exports", "topology.mmd"), "utf8");
    expect(mmd).toContain("graph");

    await execFileAsync("node", [cli, "export", "--format", "dot", "--out", outDir], {
      cwd: path.resolve(".")
    });
    const dot = await fs.readFile(path.join(outDir, "exports", "topology.dot"), "utf8");
    expect(dot).toMatch(/digraph/);
  });

  it("impact prints reach counts and optional --save writes impact report", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");

    const { stdout } = await execFileAsync(
      "node",
      [cli, "impact", "--node", "src/index.ts", "--out", outDir],
      { cwd: path.resolve(".") }
    );
    expect(stdout).toMatch(/forward|backward|reach/i);

    await execFileAsync(
      "node",
      [cli, "impact", "--node", "src/index.ts", "--save", "--out", outDir],
      { cwd: path.resolve(".") }
    );
    const impactPath = path.join(outDir, "analysis", "impact_src_index_ts.json");
    const impact = JSON.parse(await fs.readFile(impactPath, "utf8"));
    expect(impact.schemaVersion).toBe("1.0");
    expect(typeof impact.forwardCount).toBe("number");
    expect(typeof impact.backwardCount).toBe("number");
    expect(Array.isArray(impact.topNodes)).toBe(true);
  });

  it("duplicates writes duplicates.json", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");
    const configPath = path.join(outDir, "repocortex.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: "1.0",
        repoRoot: fixtureRepo,
        outputDir: outDir,
        maxFiles: 50000,
        maxBytes: 2e9
      }),
      "utf8"
    );

    await execFileAsync("node", [cli, "duplicates", "--config", configPath], {
      cwd: path.resolve(".")
    });
    const p = path.join(outDir, "analysis", "duplicates.json");
    const raw = JSON.parse(await fs.readFile(p, "utf8"));
    expect(raw.schemaVersion).toBe("1.0");
    expect(Array.isArray(raw.pairs)).toBe(true);
  });

  it("health prints system health score and metrics", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");

    const { stdout } = await execFileAsync("node", [cli, "health", "--out", outDir], {
      cwd: path.resolve(".")
    });
    expect(stdout).toMatch(/System Health|Gateway|Duplicate|Structural Density|Score/i);
  });

  it("diff produces diff report between two snapshots", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await runPipeline("2000-01-01T00:00:00.000Z");
    const idsAfterFirst = (await fs.readdir(path.join(outDir, "snapshots")))
      .filter((n) => n !== "." && n !== "..")
      .sort();
    expect(idsAfterFirst.length).toBe(1);
    const id1 = idsAfterFirst[0]!;
    await fs.writeFile(path.join(fixtureRepo, "extra.txt"), "extra", "utf8");
    try {
      await runPipeline("2000-01-02T00:00:00.000Z");
      const ids = (await fs.readdir(path.join(outDir, "snapshots")))
        .filter((n) => n !== "." && n !== "..")
        .sort();
      expect(ids.length).toBe(2);
      const id2 = ids[1]!;
      await execFileAsync(
        "node",
        [cli, "diff", "--snapshot", id1, "--snapshot", id2, "--out", outDir],
        { cwd: path.resolve(".") }
      );
      const safe1 = id1.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safe2 = id2.replace(/[^a-zA-Z0-9_-]/g, "_");
      const diffPath = path.join(outDir, "diff", `diff_${safe1}_${safe2}.json`);
      const diff = JSON.parse(await fs.readFile(diffPath, "utf8"));
      expect(diff.schemaVersion).toBe("1.0");
      expect(diff.snapshotId1).toBe(id1);
      expect(diff.snapshotId2).toBe(id2);
      expect(Array.isArray(diff.addedNodes)).toBe(true);
      expect(Array.isArray(diff.removedNodes)).toBe(true);
    } finally {
      await fs.rm(path.join(fixtureRepo, "extra.txt"), { force: true });
    }
  });
});
