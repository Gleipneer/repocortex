import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFileIndex,
  parseDepGraph,
  parseSymbolIndex,
  parseRuntimeSignals,
  parseBrainTopology,
  parseFlows,
  parseGapsReport,
  parseEssencePack,
  parseLedgerEntry
} from "../../src/core/validate.js";

const fixturesDir = join(fileURLToPath(import.meta.url), "../../fixtures/schemas");

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(fixturesDir, name), "utf8");
  return JSON.parse(raw) as unknown;
}

describe("schema parse from fixtures", () => {
  it("parseFileIndex", async () => {
    const data = await loadFixture("fileIndex.json");
    const out = parseFileIndex(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.repoRoot).toBe("/repo");
    expect(out.files).toHaveLength(2);
    const f0 = out.files[0];
    expect(f0).toBeDefined();
    expect(f0!.path).toBe("src/a.ts");
    expect(f0!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.totals.fileCount).toBe(2);
    expect(out.totals.totalBytes).toBe(300);
  });

  it("parseDepGraph", async () => {
    const data = await loadFixture("depGraph.json");
    const out = parseDepGraph(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
    const edge0 = out.edges[0];
    expect(edge0).toBeDefined();
    expect(edge0!.from).toBe("src/a.ts");
    expect(edge0!.to).toBe("src/b.ts");
    expect(edge0!.kind).toBe("import");
    expect(edge0!.isExternal).toBe(false);
  });

  it("parseSymbolIndex", async () => {
    const data = await loadFixture("symbolIndex.json");
    const out = parseSymbolIndex(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.symbols).toHaveLength(1);
    const s0 = out.symbols[0];
    expect(s0).toBeDefined();
    expect(s0!.name).toBe("foo");
    expect(s0!.kind).toBe("export");
    expect(s0!.exported).toBe(true);
  });

  it("parseRuntimeSignals", async () => {
    const data = await loadFixture("runtimeSignals.json");
    const out = parseRuntimeSignals(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.signals).toHaveLength(1);
    const sig0 = out.signals[0];
    expect(sig0).toBeDefined();
    expect(sig0!.kind).toBe("httpServer");
    expect(sig0!.line).toBe(10);
    expect(sig0!.snippet).toBe("listen(3000)");
  });

  it("parseBrainTopology", async () => {
    const data = await loadFixture("brainTopology.json");
    const out = parseBrainTopology(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
    expect(out.metrics.nodeCount).toBe(2);
    expect(out.metrics.edgeCount).toBe(1);
    const n0 = out.nodes[0];
    expect(n0).toBeDefined();
    expect(n0!.label).toBe("API");
    expect(n0!.kind).toBe("module");
  });

  it("parseFlows", async () => {
    const data = await loadFixture("flows.json");
    const out = parseFlows(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.flows).toHaveLength(1);
    const f0 = out.flows[0];
    expect(f0).toBeDefined();
    expect(f0!.kind).toBe("exec");
    expect(f0!.path).toEqual(["n1", "n2"]);
  });

  it("parseGapsReport", async () => {
    const data = await loadFixture("gapsReport.json");
    const out = parseGapsReport(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.summary.medium).toBe(1);
    expect(out.gaps).toHaveLength(1);
    const g0 = out.gaps[0];
    expect(g0).toBeDefined();
    expect(g0!.severity).toBe("medium");
    expect(g0!.title).toBe("Unreachable code");
    const ev0 = g0!.evidence[0];
    expect(ev0).toBeDefined();
    expect(ev0!.file).toBe("src/x.ts");
  });

  it("parseEssencePack", async () => {
    const data = await loadFixture("essencePack.json");
    const out = parseEssencePack(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.overview).toBe("Small repo with two modules.");
    expect(out.constraints.maxChars).toBe(12000);
    expect(out.evidencePointers).toHaveLength(1);
    expect(out.topologySummary.topCentralNodes).toEqual(["n1"]);
  });

  it("parseLedgerEntry", async () => {
    const data = await loadFixture("ledgerEntry.json");
    const out = parseLedgerEntry(data);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.runId).toBe("abc123");
    expect(out.atIso).toBe("2025-01-01T00:00:00.000Z");
    expect(out.command).toBe("scan");
    expect(out.repoRoot).toBe("/repo");
    expect(out.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(out.artifacts).toEqual(["fileIndex.json"]);
    expect(out.notes).toEqual([]);
  });
});
