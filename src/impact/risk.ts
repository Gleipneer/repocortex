import type { DepGraph } from "../schemas/depGraph.schema.js";
import type { FileIndex } from "../schemas/fileIndex.schema.js";
import type { BrainTopology } from "../schemas/topology.schema.js";
import { computeImpactCone } from "./cone.js";

export type RiskResult = {
  impactConeSize: number;
  centrality: number;
  impactedTests: number;
  changeRadius: number;
  riskScore: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function estimateRisk(params: {
  target: string;
  depGraph: DepGraph;
  fileIndex: FileIndex;
  topology: BrainTopology;
}): RiskResult {
  const { target, depGraph, fileIndex, topology } = params;
  const cone = computeImpactCone({ target, depGraph, fileIndex });
  const node = topology.nodes.find((n) => n.id === target);
  const centrality = node?.centrality ?? 0;

  const impactConeSize =
    cone.directImports.length + cone.reverseImports.length + cone.indirectImportsDepth2.length;
  const changeRadius = impactConeSize + cone.impactedTests.length;

  const score =
    clamp(centrality, 0, 1) * 40 +
    clamp(impactConeSize / 50, 0, 1) * 30 +
    clamp(cone.impactedTests.length / 20, 0, 1) * 20 +
    clamp(changeRadius / 50, 0, 1) * 10;

  return {
    impactConeSize,
    centrality,
    impactedTests: cone.impactedTests.length,
    changeRadius,
    riskScore: Math.round(score)
  };
}
