import { describe, expect, it } from "vitest";
import { computeAdvancedMetrics } from "../../src/advanced/metrics.js";
import type { BrainTopology } from "../../src/schemas/topology.schema.js";
import { stableStringify } from "../../src/core/stableJson.js";

function makeTopology(
  nodes: { id: string }[],
  edges: { from: string; to: string }[]
): BrainTopology {
  return {
    schemaVersion: "1.0",
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.id,
      kind: "module" as const,
      riskFlags: [],
      centrality: 0
    })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: "calls" as const,
      riskFlags: []
    })),
    metrics: { nodeCount: nodes.length, edgeCount: edges.length }
  };
}

describe("advanced metrics", () => {
  it("PageRank sum is close to 1.0", () => {
    const topo = makeTopology(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" }
      ]
    );
    const m = computeAdvancedMetrics(topo);
    const sum = Object.values(m.pageRank).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("stabilityIndex is in [0, 1]", () => {
    const topo = makeTopology([{ id: "x" }, { id: "y" }], [{ from: "x", to: "y" }]);
    const m = computeAdvancedMetrics(topo);
    expect(m.stabilityIndex).toBeGreaterThanOrEqual(0);
    expect(m.stabilityIndex).toBeLessThanOrEqual(1);
  });

  it("gateways has at least 1 when there are nodes", () => {
    const topo = makeTopology([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }]);
    const m = computeAdvancedMetrics(topo);
    expect(m.gateways.length).toBeGreaterThanOrEqual(1);
  });

  it("output is deterministic (same topology => same JSON)", () => {
    const topo = makeTopology(
      [{ id: "n1" }, { id: "n2" }, { id: "n3" }],
      [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
        { from: "n3", to: "n1" }
      ]
    );
    const m1 = computeAdvancedMetrics(topo);
    const m2 = computeAdvancedMetrics(topo);
    expect(stableStringify(m1)).toBe(stableStringify(m2));
  });

  it("empty graph has stabilityIndex 0 and empty pageRank/betweenness", () => {
    const topo = makeTopology([], []);
    const m = computeAdvancedMetrics(topo);
    expect(m.stabilityIndex).toBe(0);
    expect(Object.keys(m.pageRank)).toHaveLength(0);
    expect(Object.keys(m.betweenness)).toHaveLength(0);
    expect(m.gateways).toHaveLength(0);
  });
});
