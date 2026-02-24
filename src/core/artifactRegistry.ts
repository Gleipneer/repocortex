import path from "node:path";
import type { PipelineArtifacts } from "./pipeline.js";

export function artifactsForMetrics(): string[] {
  return ["advanced/advanced_metrics.json"];
}

export function artifactsForScan(outputDir: string, paths: { fileIndex: string }): string[] {
  return [path.relative(outputDir, paths.fileIndex)];
}

export function artifactsForMap(outputDir: string, paths: PipelineArtifacts): string[] {
  return [
    path.relative(outputDir, paths.fileIndexPath),
    "facts/runtimeSignals.json",
    "facts/depGraph.json",
    "facts/symbolIndex.json",
    "topology/brain_topology.json",
    "topology/flows.json"
  ];
}

export function artifactsForGaps(): string[] {
  return ["analysis/gaps_report.json", "analysis/gaps_report.md"];
}

export function artifactsForEssence(): string[] {
  return ["essence/pack.json", "essence/pack.md"];
}

export function artifactsForPipeline(outputDir: string, paths: PipelineArtifacts): string[] {
  return [
    path.relative(outputDir, paths.fileIndexPath),
    "facts/runtimeSignals.json",
    "facts/depGraph.json",
    "facts/symbolIndex.json",
    "topology/brain_topology.json",
    "topology/flows.json",
    "analysis/gaps_report.json",
    "analysis/gaps_report.md",
    "essence/pack.json",
    "essence/pack.md"
  ];
}
