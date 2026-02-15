import type { BrainTopology } from "../schemas/topology.schema.js";

/**
 * Build adjacency: nodeId -> list of targets (out-edges).
 */
function buildOutAdjacency(topology: BrainTopology): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of topology.nodes) m.set(n.id, []);
  for (const e of topology.edges) {
    const list = m.get(e.from);
    if (list) list.push(e.to);
    else m.set(e.from, [e.to]);
  }
  return m;
}

/**
 * Build reverse adjacency: nodeId -> list of sources (in-edges).
 */
function buildInAdjacency(topology: BrainTopology): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of topology.nodes) m.set(n.id, []);
  for (const e of topology.edges) {
    const list = m.get(e.to);
    if (list) list.push(e.from);
    else m.set(e.to, [e.from]);
  }
  return m;
}

/**
 * Forward reach: all nodes reachable from start (BFS following out-edges).
 */
export function forwardReach(topology: BrainTopology, startId: string): Set<string> {
  const out = buildOutAdjacency(topology);
  const seen = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const v = queue.shift()!;
    if (seen.has(v)) continue;
    seen.add(v);
    for (const w of out.get(v) ?? []) queue.push(w);
  }
  return seen;
}

/**
 * Backward reach: all nodes that can reach start (BFS following in-edges).
 */
export function backwardReach(topology: BrainTopology, startId: string): Set<string> {
  const inc = buildInAdjacency(topology);
  const seen = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const v = queue.shift()!;
    if (seen.has(v)) continue;
    seen.add(v);
    for (const w of inc.get(v) ?? []) queue.push(w);
  }
  return seen;
}

/**
 * Top 10 nodes by forward+backward reach size (deterministic tie-break by id).
 */
export function topReachNodes(
  topology: BrainTopology,
  limit: number
): { nodeId: string; forward: number; backward: number; total: number }[] {
  const nodeIds = topology.nodes.map((n) => n.id).sort();

  const scores: { nodeId: string; forward: number; backward: number; total: number }[] = [];
  for (const id of nodeIds) {
    const fw = forwardReach(topology, id).size;
    const bw = backwardReach(topology, id).size;
    scores.push({ nodeId: id, forward: fw, backward: bw, total: fw + bw });
  }
  scores.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
  });
  return scores.slice(0, limit);
}

export function computeImpact(
  topology: BrainTopology,
  nodeId: string
): {
  forwardCount: number;
  backwardCount: number;
  topNodes: { nodeId: string; forward: number; backward: number; total: number }[];
} {
  const fw = forwardReach(topology, nodeId);
  const bw = backwardReach(topology, nodeId);
  const topNodes = topReachNodes(topology, 10);
  return {
    forwardCount: fw.size,
    backwardCount: bw.size,
    topNodes
  };
}
