import path from "node:path";
import fs from "node:fs/promises";
import type { PipelineArtifacts } from "../core/pipeline.js";
import { parseBrainTopology } from "../core/validate.js";
import { parseGapsReport } from "../core/validate.js";

export interface RunSummaryInput {
  repoRoot: string;
  snapshotId: string;
  artifacts: PipelineArtifacts;
  /** When true, print artifact paths (default true) */
  printPaths?: boolean;
}

/**
 * Read topology and gaps from artifact paths and print structured Run Summary.
 */
export async function printRunSummary(input: RunSummaryInput): Promise<void> {
  const { repoRoot, snapshotId, artifacts, printPaths = true } = input;

  let nodes = 0;
  let edges = 0;
  let high = 0;
  let medium = 0;
  let low = 0;
  let critical = 0;

  try {
    const topoRaw = await fs.readFile(artifacts.topologyPath, "utf8");
    const topology = parseBrainTopology(JSON.parse(topoRaw) as unknown);
    nodes = topology.metrics?.nodeCount ?? topology.nodes?.length ?? 0;
    edges = topology.metrics?.edgeCount ?? topology.edges?.length ?? 0;
  } catch {
    // ignore
  }

  try {
    const gapsRaw = await fs.readFile(artifacts.gapsJsonPath, "utf8");
    const gaps = parseGapsReport(JSON.parse(gapsRaw) as unknown);
    critical = gaps.summary.critical ?? 0;
    high = gaps.summary.high ?? 0;
    medium = gaps.summary.medium ?? 0;
    low = gaps.summary.low ?? 0;
  } catch {
    // ignore
  }

  const outputDir = path.dirname(path.dirname(artifacts.topologyPath));
  const rel = (p: string) => path.relative(outputDir, p);

  console.log("RepoCortex Run Summary");
  console.log("----------------------");
  console.log(`Repo: ${repoRoot}`);
  console.log(`Snapshot: ${snapshotId}`);
  console.log(`Nodes: ${nodes}`);
  console.log(`Edges: ${edges}`);
  console.log(`High risks: ${high}`);
  console.log(`Medium risks: ${medium}`);
  console.log(`Low risks: ${low}`);
  if (critical > 0) console.log(`Critical risks: ${critical}`);
  console.log("");
  if (printPaths) {
    console.log("Artifacts:");
    console.log(`- ${rel(artifacts.topologyPath)}`);
    console.log(`- ${rel(artifacts.gapsMdPath)}`);
    console.log(`- ${rel(artifacts.essenceMdPath)}`);
    console.log("");
  }
  console.log("Status: SUCCESS");
}
