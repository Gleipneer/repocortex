import path from "node:path";
import fs from "node:fs/promises";
import { computeAdvancedMetrics } from "./metrics.js";
import { parseBrainTopology } from "../core/validate.js";
import { writeJsonAtomic } from "../core/io.js";
import { stableStringify } from "../core/stableJson.js";
import { sha256 } from "../core/hash.js";
import type { AdvancedMetrics } from "../schemas/advancedMetrics.schema.js";

const TOPOLOGY_REL = "topology/brain_topology.json";
const ADVANCED_REL = "advanced/advanced_metrics.json";

/**
 * Read topology from outputDir, compute advanced metrics, write to outputDir/advanced/advanced_metrics.json.
 * Returns advancedMetricsHash = sha256(stableStringify(metrics)).
 * Deterministic: same topology => same file and hash.
 */
export async function runAdvancedMetrics(outputDir: string): Promise<{
  advancedMetricsHash: string;
  metrics: AdvancedMetrics;
}> {
  const topologyPath = path.join(outputDir, TOPOLOGY_REL);
  const raw = await fs.readFile(topologyPath, "utf8");
  const topology = parseBrainTopology(JSON.parse(raw) as unknown);

  const metrics = computeAdvancedMetrics(topology);
  const outPath = path.join(outputDir, ADVANCED_REL);
  await writeJsonAtomic(outPath, metrics, outputDir);

  const content = stableStringify(metrics);
  const advancedMetricsHash = sha256(content);
  return { advancedMetricsHash, metrics };
}

export function getAdvancedMetricsPath(outputDir: string): string {
  return path.join(outputDir, ADVANCED_REL);
}
