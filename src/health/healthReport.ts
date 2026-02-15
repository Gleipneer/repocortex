import path from "node:path";
import { readJson } from "../core/io.js";
import { parseAdvancedMetrics } from "../core/validate.js";
import { parseGapsReport } from "../core/validate.js";
import { DuplicatesReportSchema } from "../schemas/duplicates.schema.js";

export interface HealthSummary {
  systemHealthScore: number;
  gatewayNodes: number;
  duplicatePairs: number;
  structuralDensity: number;
}

/**
 * Read advanced_metrics, gaps, duplicates (if present). No writes.
 * Deterministic.
 */
export async function computeHealthSummary(outputDir: string): Promise<HealthSummary> {
  const advancedPath = path.join(outputDir, "advanced", "advanced_metrics.json");
  const gapsPath = path.join(outputDir, "analysis", "gaps_report.json");
  const duplicatesPath = path.join(outputDir, "analysis", "duplicates.json");

  let stabilityIndex = 0;
  let gatewayCount = 0;
  try {
    const adv = parseAdvancedMetrics(await readJson(advancedPath));
    stabilityIndex = adv.stabilityIndex;
    gatewayCount = adv.gateways.length;
  } catch {
    // missing advanced metrics
  }

  let riskSum = 0;
  try {
    const gaps = parseGapsReport(await readJson(gapsPath));
    riskSum =
      (gaps.summary.high ?? 0) * 0.4 +
      (gaps.summary.medium ?? 0) * 0.2 +
      (gaps.summary.low ?? 0) * 0.05;
  } catch {
    // missing gaps
  }

  let duplicatePairs = 0;
  try {
    const dup = await readJson(duplicatesPath);
    const report = DuplicatesReportSchema.parse(dup);
    duplicatePairs = report.pairs.length;
  } catch {
    // no duplicates file
  }

  const structuralDensity = 1 - stabilityIndex;
  const systemHealthScore = Math.max(
    0,
    Math.min(1, stabilityIndex * 0.7 + (1 - Math.min(1, riskSum / 10)) * 0.3)
  );

  return {
    systemHealthScore: Math.round(systemHealthScore * 100) / 100,
    gatewayNodes: gatewayCount,
    duplicatePairs,
    structuralDensity: Math.round(structuralDensity * 100) / 100
  };
}
