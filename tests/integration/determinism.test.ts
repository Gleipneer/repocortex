import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runFullPipeline } from "../../src/core/pipeline.js";
import { sha256 } from "../../src/core/hash.js";

async function readAllArtifacts(dir: string): Promise<string> {
  const rel = [
    "facts/runtimeSignals.json",
    "facts/depGraph.json",
    "facts/symbolIndex.json",
    "topology/brain_topology.json",
    "topology/flows.json",
    "analysis/gaps_report.json",
    "analysis/gaps_report.md",
    "essence/pack.json",
    "essence/pack.md"
  ];
  let acc = "";
  for (const r of rel) {
    const p = path.join(dir, r);
    const b = await fs.readFile(p, "utf8");
    acc += `${r}\n${b}\n`;
  }

  const snaps = await fs.readdir(path.join(dir, "snapshots"));
  snaps.sort();
  const snapId = snaps[0];
  if (!snapId) throw new Error("No snapshot found");
  const fileIndex = await fs.readFile(
    path.join(dir, "snapshots", snapId, "fileIndex.json"),
    "utf8"
  );
  acc = `snapshots/${snapId}/fileIndex.json\n${fileIndex}\n` + acc;

  return sha256(acc);
}

const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const out1 = path.resolve("tests/.tmp/det1");
const out2 = path.resolve("tests/.tmp/det2");

describe("determinism", () => {
  it("pipeline produces identical artifacts across runs (excluding ledger timestamps)", async () => {
    await fs.rm(out1, { recursive: true, force: true });
    await fs.rm(out2, { recursive: true, force: true });

    const iso = "2000-01-01T00:00:00.000Z";
    const r1 = await runFullPipeline({ repoRoot: fixtureRepo, outputDir: out1, clockIso: iso });
    const r2 = await runFullPipeline({ repoRoot: fixtureRepo, outputDir: out2, clockIso: iso });

    expect(r1.outputHash).toBe(r2.outputHash);

    const h1 = await readAllArtifacts(out1);
    const h2 = await readAllArtifacts(out2);
    expect(h1).toBe(h2);
  });
});
