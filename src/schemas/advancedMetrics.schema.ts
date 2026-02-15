import { z } from "zod";

/**
 * Advanced metrics artifact (storage/advanced/advanced_metrics.json).
 * Separate from topology; do not modify brain_topology.json.
 */
export const AdvancedMetricsSchema = z.object({
  schemaVersion: z.literal("1.0"),
  pageRank: z.record(z.string(), z.number()),
  betweenness: z.record(z.string(), z.number()),
  gateways: z.array(z.string()),
  stabilityIndex: z.number().min(0).max(1)
});

export type AdvancedMetrics = z.infer<typeof AdvancedMetricsSchema>;
