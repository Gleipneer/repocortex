import type { BrainTopology } from "../schemas/topology.schema.js";
import type { AdvancedMetrics } from "../schemas/advancedMetrics.schema.js";
import { AdvancedMetricsSchema } from "../schemas/advancedMetrics.schema.js";
import { validateOrThrow } from "../core/io.js";

const PAGERANK_ITERATIONS = 20;
const PAGERANK_DAMPING = 0.85;
const PAGERANK_SUM_TOLERANCE = 1e-6;

/**
 * Build directed graph from topology ONLY. No endpoint expansion.
 * Uses topology.nodes and topology.edges only. Every edge endpoint must be in topology.nodes.
 */
function buildAdjacencyFromTopology(topology: BrainTopology): {
  nodeIds: string[];
  outEdges: Map<string, string[]>;
  inEdges: Map<string, string[]>;
  n: number;
  m: number;
} {
  const nodeIds = [...topology.nodes]
    .map((n) => n.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .sort();
  const n = nodeIds.length;
  const nodeSet = new Set(nodeIds);

  if (n !== topology.nodes.length) {
    throw new Error(
      `Topology invariant violated: duplicate node ids (unique=${n}, nodes.length=${topology.nodes.length})`
    );
  }
  if (topology.metrics.nodeCount !== topology.nodes.length) {
    throw new Error(
      `Topology invariant violated: metrics.nodeCount (${topology.metrics.nodeCount}) !== nodes.length (${topology.nodes.length})`
    );
  }
  if (topology.metrics.edgeCount !== topology.edges.length) {
    throw new Error(
      `Topology invariant violated: metrics.edgeCount (${topology.metrics.edgeCount}) !== edges.length (${topology.edges.length})`
    );
  }

  for (const e of topology.edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) {
      throw new Error(
        `Topology edge endpoint not in nodes: from=${e.from} to=${e.to}. Metrics use only topology.nodes; no implicit nodes.`
      );
    }
  }

  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  for (const id of nodeIds) {
    outEdges.set(id, []);
    inEdges.set(id, []);
  }
  for (const e of topology.edges) {
    outEdges.get(e.from)!.push(e.to);
    inEdges.get(e.to)!.push(e.from);
  }
  const m = topology.edges.length;
  return { nodeIds, outEdges, inEdges, n, m };
}

/**
 * PageRank: 20 iterations, damping 0.85, normalized sum = 1.
 */
function computePageRank(
  nodeIds: string[],
  outEdges: Map<string, string[]>,
  inEdges: Map<string, string[]>,
  n: number
): Record<string, number> {
  const oneOverN = 1 / Math.max(1, n);
  let rank = new Map<string, number>();
  for (const id of nodeIds) rank.set(id, oneOverN);

  for (let iter = 0; iter < PAGERANK_ITERATIONS; iter++) {
    const next = new Map<string, number>();
    for (const v of nodeIds) {
      let sum = 0;
      for (const u of inEdges.get(v)!) {
        const outDeg = outEdges.get(u)!.length;
        sum += rank.get(u)! / Math.max(1, outDeg);
      }
      next.set(v, (1 - PAGERANK_DAMPING) * oneOverN + PAGERANK_DAMPING * sum);
    }
    rank = next;
  }

  let total = 0;
  for (const v of nodeIds) total += rank.get(v)!;
  const scale = total > 0 ? 1 / total : 1;
  const out: Record<string, number> = {};
  for (const id of nodeIds) out[id] = rank.get(id)! * scale;
  return out;
}

/**
 * Betweenness centrality (Brandes). Directed graph.
 */
function computeBetweenness(
  nodeIds: string[],
  outEdges: Map<string, string[]>
): Record<string, number> {
  const betweenness = new Map<string, number>();
  for (const id of nodeIds) betweenness.set(id, 0);

  for (const s of nodeIds) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    for (const id of nodeIds) {
      pred.set(id, []);
      sigma.set(id, 0);
      dist.set(id, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const neighbors = outEdges.get(v)!.slice().sort();
      for (const w of neighbors) {
        if (dist.get(w)! === -1) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          const sigV = sigma.get(v)!;
          sigma.set(w, sigma.get(w)! + sigV);
          pred.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const id of nodeIds) delta.set(id, 0);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
    }
  }

  const out: Record<string, number> = {};
  for (const id of nodeIds) out[id] = betweenness.get(id)!;
  return out;
}

/**
 * Gateways = top 5% by betweenness (min 1 node).
 */
function computeGateways(nodeIds: string[], betweenness: Record<string, number>): string[] {
  const k = Math.max(1, Math.ceil(nodeIds.length * 0.05));
  const sorted = nodeIds.slice().sort((a, b) => {
    const ba = betweenness[a] ?? 0;
    const bb = betweenness[b] ?? 0;
    if (bb !== ba) return bb - ba;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return sorted.slice(0, k);
}

/**
 * stabilityIndex = 1 - edgeDensity, edgeDensity = m/n², bound 0–1.
 */
function computeStabilityIndex(n: number, m: number): number {
  if (n <= 0) return 0;
  const edgeDensity = m / (n * n);
  return Math.max(0, Math.min(1, 1 - edgeDensity));
}

/**
 * Sanity guards before accepting metrics. Throws on violation.
 */
function assertMetricSanity(
  n: number,
  m: number,
  _s: number,
  pageRank: Record<string, number>,
  _b: Record<string, number>,
  nodeIds: string[]
): void {
  if (n <= 0) {
    throw new Error("Metric sanity: n must be > 0");
  }
  if (m < 0) {
    throw new Error("Metric sanity: m must be >= 0");
  }
  if (m > n * (n - 1)) {
    throw new Error(
      `Metric sanity: m (${m}) must be <= n*(n-1) (${n * (n - 1)}). Directed simple graph cannot have more edges.`
    );
  }
  const density = n > 0 ? m / (n * n) : 0;
  if (density < 0 || density > 1) {
    throw new Error(`Metric sanity: density must be in [0,1], got ${density}`);
  }
  const prSum = nodeIds.reduce((s, id) => s + (pageRank[id] ?? 0), 0);
  if (Math.abs(prSum - 1) > PAGERANK_SUM_TOLERANCE) {
    throw new Error(
      `Metric sanity: PageRank sum must be ≈1 (±${PAGERANK_SUM_TOLERANCE}), got ${prSum}`
    );
  }
}

/**
 * Compute advanced metrics from topology. Single source of truth: topology.nodes and topology.edges only.
 * No fallback, no endpoint expansion. Fails hard on invariant violation.
 */
export function computeAdvancedMetrics(topology: BrainTopology): AdvancedMetrics {
  const { nodeIds, outEdges, inEdges, n, m } = buildAdjacencyFromTopology(topology);

  const pageRank = computePageRank(nodeIds, outEdges, inEdges, n);
  const betweenness = computeBetweenness(nodeIds, outEdges);
  const gateways = computeGateways(nodeIds, betweenness);
  const stabilityIndex = computeStabilityIndex(n, m);

  assertMetricSanity(n, m, stabilityIndex, pageRank, betweenness, nodeIds);

  const result: AdvancedMetrics = {
    schemaVersion: "1.0",
    pageRank,
    betweenness,
    gateways,
    stabilityIndex
  };
  return validateOrThrow(AdvancedMetricsSchema, result);
}
