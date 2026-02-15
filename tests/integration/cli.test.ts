import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

describe("cli", () => {
  it("repocortex pipeline runs and produces artifacts", async () => {
    const repoRoot = path.resolve("tests/fixtures/mini-repo");
    const outDir = path.resolve("tests/.tmp/cli");
    await fs.rm(outDir, { recursive: true, force: true });

    const cli = path.resolve("dist/cli/main.js");
    await execFileAsync("node", [cli, "pipeline", "--repo", repoRoot, "--out", outDir]);

    const mustExist = [
      "facts/runtimeSignals.json",
      "facts/depGraph.json",
      "facts/symbolIndex.json",
      "topology/brain_topology.json",
      "analysis/gaps_report.json",
      "essence/pack.json",
      "ledger/ledger.jsonl"
    ];
    for (const f of mustExist) {
      await fs.stat(path.join(outDir, f));
    }
    expect(true).toBe(true);
  });
});
