import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseBrainTopology } from "../../src/core/validate.js";
import { parseAdvancedMetrics } from "../../src/core/validate.js";
import { computeAdvancedMetrics } from "../../src/advanced/metrics.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist/cli/main.js");
const fixtureRepo = path.resolve("tests/fixtures/mini-repo");
const outDir = path.resolve("tests/.tmp/topology-metrics-validation");

describe("topology-metrics cross-validation", () => {
  it("metrics diverge from topology when advanced_metrics is stale or wrong", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });
    await execFileAsync("node", [cli, "metrics", "--out", outDir], {
      cwd: path.resolve(".")
    });

    const topologyPath = path.join(outDir, "topology", "brain_topology.json");
    const advancedPath = path.join(outDir, "advanced", "advanced_metrics.json");

    const topologyRaw = JSON.parse(await fs.readFile(topologyPath, "utf8")) as unknown;
    const topology = parseBrainTopology(topologyRaw);
    const metricsRaw = JSON.parse(await fs.readFile(advancedPath, "utf8")) as unknown;
    const metrics = parseAdvancedMetrics(metricsRaw);

    expect(topology.metrics.nodeCount).toBe(topology.nodes.length);
    expect(topology.metrics.edgeCount).toBe(topology.edges.length);

    const n = topology.nodes.length;
    const m = topology.edges.length;
    const edgeDensity = n > 0 ? m / (n * n) : 0;
    const expectedStabilityIndex = Math.max(0, Math.min(1, 1 - edgeDensity));

    expect(metrics.stabilityIndex).toBeCloseTo(expectedStabilityIndex, 10);
    expect(Object.keys(metrics.pageRank).length).toBe(n);
    expect(Object.keys(metrics.betweenness).length).toBe(n);
    expect(metrics.gateways.length).toBeGreaterThanOrEqual(0);
    expect(metrics.gateways.length).toBeLessThanOrEqual(n);

    const nodeIds = new Set(topology.nodes.map((no) => no.id));
    for (const id of metrics.gateways) {
      expect(nodeIds.has(id)).toBe(true);
    }
    for (const id of Object.keys(metrics.pageRank)) {
      expect(nodeIds.has(id)).toBe(true);
    }
  });

  it("recomputed metrics from topology match stored advanced_metrics", async () => {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    await execFileAsync("node", [cli, "run", "--repo", fixtureRepo, "--out", outDir], {
      cwd: path.resolve("."),
      env: { ...process.env, REPOCORTEX_CLOCK_ISO: "2000-01-01T00:00:00.000Z" }
    });
    await execFileAsync("node", [cli, "metrics", "--out", outDir], {
      cwd: path.resolve(".")
    });

    const topologyPath = path.join(outDir, "topology", "brain_topology.json");
    const advancedPath = path.join(outDir, "advanced", "advanced_metrics.json");

    const topology = parseBrainTopology(
      JSON.parse(await fs.readFile(topologyPath, "utf8")) as unknown
    );
    const stored = parseAdvancedMetrics(
      JSON.parse(await fs.readFile(advancedPath, "utf8")) as unknown
    );
    const recomputed = computeAdvancedMetrics(topology);

    expect(recomputed.stabilityIndex).toBe(stored.stabilityIndex);
    expect(recomputed.gateways.length).toBe(stored.gateways.length);
    for (const id of topology.nodes.map((n) => n.id)) {
      expect(recomputed.pageRank[id]).toBe(stored.pageRank[id]);
      expect(recomputed.betweenness[id]).toBe(stored.betweenness[id]);
    }
  });
});
