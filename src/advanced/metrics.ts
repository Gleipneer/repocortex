import type { BrainTopology } from "../schemas/topology.schema.js";
import type { AdvancedMetrics } from "../schemas/advancedMetrics.schema.js";
import { AdvancedMetricsSchema } from "../schemas/advancedMetrics.schema.js";
import { validateOrThrow } from "../core/io.js";

const PAGERANK_ITERATIONS = 20;
const PAGERANK_DAMPING = 0.85;

/**
 * Build directed graph: node ids, out-edges (from -> [to]), and in-edges (to -> [from]) for PageRank.
 * Deterministic: node ids sorted.
 */
function buildGraph(topology: BrainTopology): {
  nodeIds: string[];
  outEdges: Map<string, string[]>;
  inEdges: Map<string, string[]>;
  n: number;
  m: number;
} {
  const nodeSet = new Set<string>();
  for (const n of topology.nodes) nodeSet.add(n.id);
  for (const e of topology.edges) {
    nodeSet.add(e.from);
    nodeSet.add(e.to);
  }
  const nodeIds = [...nodeSet].sort();
  const n = nodeIds.length;
  const outEdges = new Map<string, string[]>();
  const inEdges = new Map<string, string[]>();
  for (const id of nodeIds) {
    outEdges.set(id, []);
    inEdges.set(id, []);
  }
  for (const e of topology.edges) {
    if (nodeSet.has(e.from) && nodeSet.has(e.to)) {
      outEdges.get(e.from)!.push(e.to);
      inEdges.get(e.to)!.push(e.from);
    }
  }
  const m = topology.edges.length;
  return { nodeIds, outEdges, inEdges, n, m };
}

/**
 * PageRank: 20 iterations, damping 0.85, normalized sum = 1.
 * Deterministic: same topology => same result; output keys sorted.
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
 * Betweenness centrality (Brandes). Deterministic: sources and neighbors in sorted order.
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
 * Gateways = top 5% by betweenness (min 1 node). Deterministic: sort by betweenness desc, then by id.
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
 * stabilityIndex = 1 - edgeDensity, edgeDensity = edges / nodes², bound 0–1.
 */
function computeStabilityIndex(n: number, m: number): number {
  if (n <= 0) return 0;
  const edgeDensity = m / (n * n);
  return Math.max(0, Math.min(1, 1 - edgeDensity));
}

/**
 * Compute advanced metrics from topology. Deterministic.
 */
export function computeAdvancedMetrics(topology: BrainTopology): AdvancedMetrics {
  const { nodeIds, outEdges, inEdges, n, m } = buildGraph(topology);

  const pageRank = computePageRank(nodeIds, outEdges, inEdges, n);
  const betweenness = computeBetweenness(nodeIds, outEdges);
  const gateways = computeGateways(nodeIds, betweenness);
  const stabilityIndex = computeStabilityIndex(n, m);

  const result: AdvancedMetrics = {
    schemaVersion: "1.0",
    pageRank,
    betweenness,
    gateways,
    stabilityIndex
  };
  return validateOrThrow(AdvancedMetricsSchema, result);
}
