import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { SymbolIndex } from "../schemas/symbolIndex.schema.js";
import type { BrainTopology } from "../schemas/topology.schema.js";

export type RankEntry = {
  path: string;
  importDegree: number;
  exportDegree: number;
  inDegree: number;
  outDegree: number;
  centrality: number;
};

export function computeRankEntries(params: {
  depGraph: DepGraph;
  symbolIndex: SymbolIndex;
  topology: BrainTopology;
}): RankEntry[] {
  const { depGraph, symbolIndex, topology } = params;
  const nodeSet = new Set(depGraph.nodes);

  const importDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();

  for (const n of depGraph.nodes) {
    importDegree.set(n, 0);
    outDegree.set(n, 0);
    inDegree.set(n, 0);
  }

  for (const e of depGraph.edges) {
    if (importDegree.has(e.from)) {
      importDegree.set(e.from, (importDegree.get(e.from) ?? 0) + 1);
    }
    if (nodeSet.has(e.from) && nodeSet.has(e.to)) {
      outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
    }
  }

  const exportDegree = new Map<string, number>();
  for (const s of symbolIndex.symbols) {
    exportDegree.set(s.file, (exportDegree.get(s.file) ?? 0) + 1);
  }

  const centralityById = new Map<string, number>();
  for (const n of topology.nodes) {
    centralityById.set(n.id, n.centrality);
  }

  const out = depGraph.nodes.map((p) => ({
    path: p,
    importDegree: importDegree.get(p) ?? 0,
    exportDegree: exportDegree.get(p) ?? 0,
    inDegree: inDegree.get(p) ?? 0,
    outDegree: outDegree.get(p) ?? 0,
    centrality: centralityById.get(p) ?? 0
  }));

  out.sort((a, b) => {
    if (b.centrality !== a.centrality) return b.centrality - a.centrality;
    if (b.inDegree !== a.inDegree) return b.inDegree - a.inDegree;
    if (b.outDegree !== a.outDegree) return b.outDegree - a.outDegree;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return out;
}
