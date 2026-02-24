import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";

type ConeResult = {
  directImports: string[];
  reverseImports: string[];
  indirectImportsDepth2: string[];
  impactedTests: string[];
};

function isTestPath(p: string): boolean {
  return (
    p.includes("/test/") ||
    p.includes("/tests/") ||
    p.includes("/spec/") ||
    /(\.test|\.spec)\.(ts|js|tsx|jsx)$/.test(p)
  );
}

function buildAdjacency(depGraph: DepGraph): {
  out: Map<string, Set<string>>;
  inc: Map<string, Set<string>>;
  nodeSet: Set<string>;
} {
  const nodeSet = new Set(depGraph.nodes);
  const out = new Map<string, Set<string>>();
  const inc = new Map<string, Set<string>>();
  for (const n of depGraph.nodes) {
    out.set(n, new Set());
    inc.set(n, new Set());
  }
  for (const e of depGraph.edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
    out.get(e.from)?.add(e.to);
    inc.get(e.to)?.add(e.from);
  }
  return { out, inc, nodeSet };
}

export function computeImpactCone(params: {
  target: string;
  depGraph: DepGraph;
  fileIndex: FileIndex;
}): ConeResult {
  const { target, depGraph, fileIndex } = params;
  const { out, inc, nodeSet } = buildAdjacency(depGraph);

  if (!nodeSet.has(target)) {
    return {
      directImports: [],
      reverseImports: [],
      indirectImportsDepth2: [],
      impactedTests: []
    };
  }

  const directImports = Array.from(out.get(target) ?? []).sort();
  const reverseImports = Array.from(inc.get(target) ?? []).sort();

  const depth2 = new Set<string>();
  for (const d of directImports) {
    for (const n of out.get(d) ?? []) {
      if (n !== target && !directImports.includes(n)) depth2.add(n);
    }
  }

  const reverseDepth2 = new Set<string>();
  for (const r of reverseImports) {
    for (const n of inc.get(r) ?? []) {
      if (n !== target && !reverseImports.includes(n)) reverseDepth2.add(n);
    }
  }

  const testFiles = new Set(fileIndex.files.map((f) => f.path).filter(isTestPath));
  const impactedTests = Array.from(
    new Set([...reverseImports, ...reverseDepth2].filter((p) => testFiles.has(p)))
  ).sort();

  return {
    directImports,
    reverseImports,
    indirectImportsDepth2: Array.from(depth2).sort(),
    impactedTests
  };
}
