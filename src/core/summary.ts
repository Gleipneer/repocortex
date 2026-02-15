import path from "node:path";
import fs from "node:fs/promises";

export async function buildRunSummary(outputDir: string): Promise<{
  nodeCount?: number;
  edgeCount?: number;
  high?: number;
  medium?: number;
  low?: number;
}> {
  try {
    const topo = JSON.parse(
      await fs.readFile(path.join(outputDir, "topology", "brain_topology.json"), "utf8")
    );
    const gaps = JSON.parse(
      await fs.readFile(path.join(outputDir, "analysis", "gaps_report.json"), "utf8")
    );
    return {
      nodeCount: topo?.metrics?.nodeCount,
      edgeCount: topo?.metrics?.edgeCount,
      high: gaps?.summary?.high,
      medium: gaps?.summary?.medium,
      low: gaps?.summary?.low
    };
  } catch {
    return {};
  }
}

export function printArtifacts(outputDir: string): string[] {
  return [
    path.join(outputDir, "topology", "brain_topology.json"),
    path.join(outputDir, "analysis", "gaps_report.md"),
    path.join(outputDir, "essence", "pack.md")
  ];
}
