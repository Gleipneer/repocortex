#!/usr/bin/env node
/**
 * Truth-dump: compute sanity-check stats and distributions from RepoCortex output dir.
 * Deterministic; stable ordering. Use: npm run truth-dump -- --out ./openclaw-analysis
 * Writes JSON to stdout; optional --write <path> to write results file.
 */
import path from "node:path";
import fs from "node:fs/promises";

const PAGERANK_ITERATIONS = 20;
const PAGERANK_DAMPING = 0.85;

type TopologyNode = {
  id: string;
  label: string;
  kind: string;
  riskFlags: string[];
  centrality: number;
};
type TopologyEdge = { from: string; to: string; kind: string; riskFlags: string[] };
type Topology = {
  schemaVersion: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metrics: { nodeCount: number; edgeCount: number };
};

/**
 * Build graph from topology only (no endpoint expansion). Same convention as src/advanced/metrics.ts.
 */
function buildGraph(topology: Topology): {
  nodeIds: string[];
  outEdges: Map<string, string[]>;
  inEdges: Map<string, string[]>;
  outDeg: Map<string, number>;
  inDeg: Map<string, number>;
  n: number;
  m: number;
} {
  const nodeIds = [...topology.nodes]
    .map((n) => n.id)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .sort();
  const nodeSet = new Set(nodeIds);
  const n = nodeIds.length;
  const m = topology.edges.length;
  for (const e of topology.edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) {
      throw new Error(
        `Topology edge endpoint not in nodes: from=${e.from} to=${e.to}. Truth-dump uses only topology.nodes.`
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
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) {
    outDeg.set(id, outEdges.get(id)!.length);
    inDeg.set(id, inEdges.get(id)!.length);
  }
  return { nodeIds, outEdges, inEdges, outDeg, inDeg, n, m };
}

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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}

function connectedComponentsUndirected(
  nodeIds: string[],
  outEdges: Map<string, string[]>,
  inEdges: Map<string, string[]>
): { count: number; sizes: number[]; largestSize: number } {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const id of nodeIds) {
    const seen = new Set<string>();
    for (const w of outEdges.get(id)!) {
      if (!seen.has(w)) {
        seen.add(w);
        adj.get(id)!.push(w);
        adj.get(w)!.push(id);
      }
    }
    for (const w of inEdges.get(id)!) {
      if (!seen.has(w)) {
        seen.add(w);
        adj.get(id)!.push(w);
        adj.get(w)!.push(id);
      }
    }
  }
  const visited = new Set<string>();
  const sizes: number[] = [];
  for (const s of nodeIds) {
    if (visited.has(s)) continue;
    const queue: string[] = [s];
    visited.add(s);
    let size = 0;
    while (queue.length > 0) {
      const v = queue.shift()!;
      size++;
      for (const w of adj.get(v)!) {
        if (!visited.has(w)) {
          visited.add(w);
          queue.push(w);
        }
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { count: sizes.length, sizes, largestSize: sizes[0] ?? 0 };
}

function tarjanSCC(
  nodeIds: string[],
  outEdges: Map<string, string[]>
): { count: number; sizes: number[]; largestSize: number } {
  const indexMap = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let index = 0;
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indexMap.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of outEdges.get(v)!.slice().sort()) {
      if (!indexMap.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indexMap.get(w)!));
      }
    }
    if (lowlink.get(v) === indexMap.get(v)) {
      const comp: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          onStack.delete(w);
          comp.push(w);
        }
      } while (w !== v);
      if (comp.length >= 1) sccs.push(comp);
    }
  }
  for (const n of nodeIds) if (!indexMap.has(n)) strongconnect(n);
  const sizes = sccs.map((c) => c.length).sort((a, b) => b - a);
  return { count: sizes.length, sizes, largestSize: sizes[0] ?? 0 };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outDir = "";
  let writePath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) {
      outDir = path.resolve(args[++i]!);
    } else if (args[i] === "--write" && args[i + 1]) {
      writePath = path.resolve(args[++i]!);
    }
  }
  if (!outDir) {
    console.error("Usage: tsx scripts/truthDump.ts --out <outputDir> [--write <resultsPath>]");
    process.exit(1);
  }

  const topologyPath = path.join(outDir, "topology", "brain_topology.json");
  const advancedPath = path.join(outDir, "advanced", "advanced_metrics.json");
  const gapsPath = path.join(outDir, "analysis", "gaps_report.json");
  const flowsPath = path.join(outDir, "topology", "flows.json");

  let topology: Topology;
  try {
    const raw = await fs.readFile(topologyPath, "utf8");
    topology = JSON.parse(raw) as Topology;
  } catch (e) {
    console.error("Missing or invalid topology:", topologyPath, (e as Error).message);
    process.exit(1);
  }

  const { nodeIds, outEdges, inEdges, outDeg, inDeg, n, m } = buildGraph(topology);
  const nodeById = new Map<string, TopologyNode>();
  for (const no of topology.nodes) nodeById.set(no.id, no);

  const densityDirected = n <= 1 ? 0 : m / (n * (n - 1));
  const densityUndirected = n <= 1 ? 0 : m / ((n * (n - 1)) / 2);
  const totalOut = nodeIds.reduce((s, id) => s + outDeg.get(id)!, 0);
  const totalIn = nodeIds.reduce((s, id) => s + inDeg.get(id)!, 0);
  const avgOutDegree = n > 0 ? totalOut / n : 0;
  const avgInDegree = n > 0 ? totalIn / n : 0;
  const selfLoops = topology.edges.filter((e) => e.from === e.to).length;
  const pairCount = new Map<string, number>();
  for (const e of topology.edges) {
    const key = e.from < e.to ? `${e.from}\t${e.to}` : `${e.to}\t${e.from}`;
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }
  const multiEdges = [...pairCount.values()].filter((c) => c > 1).length;

  const { count: componentCount, largestSize } = connectedComponentsUndirected(
    nodeIds,
    outEdges,
    inEdges
  );
  const { count: sccCount, largestSize: largestSCC } = tarjanSCC(nodeIds, outEdges);

  const pageRank = computePageRank(nodeIds, outEdges, inEdges, n);
  const betweenness = computeBetweenness(nodeIds, outEdges);
  const degree = (id: string) => (outDeg.get(id) ?? 0) + (inDeg.get(id) ?? 0);

  const sortedByDegree = nodeIds.slice().sort((a, b) => {
    const da = degree(a);
    const db = degree(b);
    if (db !== da) return db - da;
    return a < b ? -1 : 1;
  });
  const sortedByPR = nodeIds.slice().sort((a, b) => {
    const pa = pageRank[a] ?? 0;
    const pb = pageRank[b] ?? 0;
    if (pb !== pa) return pb - pa;
    return a < b ? -1 : 1;
  });
  const sortedByBetweenness = nodeIds.slice().sort((a, b) => {
    const ba = betweenness[a] ?? 0;
    const bb = betweenness[b] ?? 0;
    if (bb !== ba) return bb - ba;
    return a < b ? -1 : 1;
  });

  const top20Degree = sortedByDegree.slice(0, 20).map((id) => ({
    nodeId: id,
    label: nodeById.get(id)?.label ?? id,
    degree: degree(id)
  }));
  const top20PageRank = sortedByPR.slice(0, 20).map((id) => ({
    nodeId: id,
    label: nodeById.get(id)?.label ?? id,
    pageRank: pageRank[id] ?? 0
  }));
  const top20Betweenness = sortedByBetweenness.slice(0, 20).map((id) => ({
    nodeId: id,
    label: nodeById.get(id)?.label ?? id,
    betweenness: betweenness[id] ?? 0
  }));

  const inDegrees = nodeIds.map((id) => inDeg.get(id)!);
  const outDegrees = nodeIds.map((id) => outDeg.get(id)!);
  const degrees = nodeIds.map((id) => degree(id));
  inDegrees.sort((a, b) => a - b);
  outDegrees.sort((a, b) => a - b);
  degrees.sort((a, b) => a - b);
  const prVals = nodeIds.map((id) => pageRank[id]!).sort((a, b) => a - b);
  const btVals = nodeIds.map((id) => betweenness[id]!).sort((a, b) => a - b);

  const edgeKindCount: Record<string, number> = {};
  for (const e of topology.edges) {
    edgeKindCount[e.kind] = (edgeKindCount[e.kind] ?? 0) + 1;
  }

  let advanced: { stabilityIndex?: number; gateways?: string[] } = {};
  try {
    advanced = JSON.parse(await fs.readFile(advancedPath, "utf8")) as typeof advanced;
  } catch {
    // optional
  }
  let gaps: { summary?: { high?: number; medium?: number; low?: number }; gaps?: unknown[] } = {};
  try {
    gaps = JSON.parse(await fs.readFile(gapsPath, "utf8")) as typeof gaps;
  } catch {
    // optional
  }
  let flowsEdgeCount = 0;
  try {
    const flows = JSON.parse(await fs.readFile(flowsPath, "utf8")) as { flows?: unknown[] };
    flowsEdgeCount = flows.flows?.length ?? 0;
  } catch {
    // optional
  }

  const stabilityIndex = n <= 0 ? 0 : Math.max(0, Math.min(1, 1 - m / (n * n)));
  const structuralDensity = 1 - stabilityIndex;

  const result = {
    artifactPaths: {
      topology: topologyPath,
      advanced: advancedPath,
      gaps: gapsPath,
      flows: flowsPath
    },
    topologyMetrics: {
      nodeCountFromFile: topology.metrics.nodeCount,
      edgeCountFromFile: topology.metrics.edgeCount,
      nFromBuildGraph: n,
      mFromBuildGraph: m,
      match: topology.metrics.nodeCount === n && topology.metrics.edgeCount === m
    },
    sanityChecks: {
      densityDirected,
      densityUndirected,
      avgOutDegree,
      avgInDegree,
      selfLoops,
      multiEdgePairs: multiEdges,
      connectedComponents: componentCount,
      largestComponentSize: largestSize,
      sccCount,
      largestSCCSize: largestSCC
    },
    computedMetrics: {
      stabilityIndex: Math.round(stabilityIndex * 1e6) / 1e6,
      structuralDensity: Math.round(structuralDensity * 1e6) / 1e6,
      advancedStabilityIndex: advanced.stabilityIndex,
      gatewayCount: advanced.gateways?.length ?? 0
    },
    top20ByDegree: top20Degree,
    top20ByPageRank: top20PageRank,
    top20ByBetweenness: top20Betweenness,
    distributions: {
      inDegree: {
        min: inDegrees[0] ?? 0,
        median: percentile(inDegrees, 50),
        p95: percentile(inDegrees, 95),
        max: inDegrees[inDegrees.length - 1] ?? 0
      },
      outDegree: {
        min: outDegrees[0] ?? 0,
        median: percentile(outDegrees, 50),
        p95: percentile(outDegrees, 95),
        max: outDegrees[outDegrees.length - 1] ?? 0
      },
      degree: {
        min: degrees[0] ?? 0,
        median: percentile(degrees, 50),
        p95: percentile(degrees, 95),
        max: degrees[degrees.length - 1] ?? 0
      },
      betweenness: {
        min: btVals[0] ?? 0,
        median: percentile(btVals, 50),
        p95: percentile(btVals, 95),
        max: btVals[btVals.length - 1] ?? 0
      },
      pageRank: {
        min: prVals[0] ?? 0,
        median: percentile(prVals, 50),
        p95: percentile(prVals, 95),
        max: prVals[prVals.length - 1] ?? 0
      }
    },
    edgeKindDistribution: edgeKindCount,
    flowsCount: flowsEdgeCount,
    gapsSummary: gaps.summary
  };

  const json = JSON.stringify(result, null, 2);
  if (writePath) await fs.writeFile(writePath, json, "utf8");
  console.log(json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
